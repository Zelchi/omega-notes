use crate::runtime::AppContext;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, io::Write, path::PathBuf, sync::Mutex, time::Duration};

const CONFIG: &str = include_str!("../../bridge/electron/updater.json");
const MAX_PACKAGE_BYTES: usize = 512 * 1024 * 1024;

#[derive(Deserialize)]
struct Config {
    endpoint: String,
    pubkey: String,
}
#[derive(Clone, Deserialize)]
struct Package {
    url: String,
    signature: String,
}
#[derive(Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    packages: HashMap<String, HashMap<String, Package>>,
}
struct Pending {
    version: String,
    package: Package,
    format: &'static str,
    staged: Option<(tempfile::TempDir, PathBuf)>,
}
#[derive(Default)]
pub(crate) struct UpdateState {
    operation: tokio::sync::Mutex<()>,
    pending: Mutex<Option<Pending>>,
}
fn config() -> Result<Config, String> {
    serde_json::from_str(CONFIG).map_err(|error| error.to_string())
}

fn installed_format() -> Option<&'static str> {
    let executable = std::env::current_exe().ok()?;
    let deb = std::process::Command::new("/usr/bin/dpkg-query")
        .arg("-S")
        .arg(&executable)
        .output();
    if deb.is_ok_and(|result| {
        result.status.success()
            && String::from_utf8_lossy(&result.stdout).lines().any(|line| {
                line.starts_with("omega-notes:") || line.starts_with("omega-notes:amd64:")
            })
    }) {
        return Some("deb");
    }
    let rpm = std::process::Command::new("/usr/bin/rpm")
        .args(["-qf", "--qf", "%{NAME}"])
        .arg(&executable)
        .output();
    if rpm.is_ok_and(|result| {
        result.status.success() && String::from_utf8_lossy(&result.stdout).trim() == "omega-notes"
    }) {
        return Some("rpm");
    }
    None
}
pub(crate) fn ready() -> bool {
    !cfg!(debug_assertions)
        && config().is_ok_and(|config| !config.endpoint.is_empty())
        && installed_format().is_some()
}

fn select(manifest: Manifest, format: &'static str) -> Result<Option<Pending>, String> {
    let version = semver::Version::parse(manifest.version.trim_start_matches('v'))
        .map_err(|error| error.to_string())?;
    let current =
        semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|error| error.to_string())?;
    if version <= current {
        return Ok(None);
    }
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let package = manifest
        .packages
        .get(&platform)
        .and_then(|packages| packages.get(format))
        .cloned()
        .ok_or("Update package unavailable")?;
    let url = reqwest::Url::parse(&package.url).map_err(|error| error.to_string())?;
    if url.scheme() != "https"
        || !url
            .path()
            .to_ascii_lowercase()
            .ends_with(&format!(".{format}"))
        || package.signature.trim().is_empty()
    {
        return Err("Invalid signed update package".into());
    }
    Ok(Some(Pending {
        version: version.to_string(),
        package,
        format,
        staged: None,
    }))
}
fn verify(bytes: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let decode = |value: &str| -> Result<String, String> {
        String::from_utf8(
            STANDARD
                .decode(value.trim())
                .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    };
    let key = minisign_verify::PublicKey::decode(&decode(public_key)?)
        .map_err(|error| error.to_string())?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?)
        .map_err(|error| error.to_string())?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "Invalid update signature".into())
}
pub(crate) fn verify_release(
    path: &std::path::Path,
    signature: &std::path::Path,
) -> Result<(), String> {
    verify(
        &std::fs::read(path).map_err(|error| error.to_string())?,
        &std::fs::read_to_string(signature).map_err(|error| error.to_string())?,
        &config()?.pubkey,
    )
}
pub(crate) async fn check(app: AppContext) -> Result<Value, String> {
    let state = app.state::<UpdateState>();
    let _operation = state.operation.lock().await;
    if !ready() {
        return Ok(Value::Null);
    }
    let config = config()?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .get(&config.endpoint)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("Update manifest too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let notes = manifest.notes.clone();
    let pending = select(
        manifest,
        installed_format().ok_or("Update installation unsupported")?,
    )?;
    let result = pending
        .as_ref()
        .map(|pending| json!({"version":pending.version,"body":notes}))
        .unwrap_or(Value::Null);
    *state.pending.lock().map_err(|_| "Updater unavailable")? = pending;
    Ok(result)
}
pub(crate) async fn download(app: AppContext, version: String) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let _operation = state.operation.lock().await;
    let (package, format) = {
        let pending = state.pending.lock().map_err(|_| "Updater unavailable")?;
        let pending = pending
            .as_ref()
            .filter(|pending| pending.version == version)
            .ok_or("Update is no longer available")?;
        (pending.package.clone(), pending.format)
    };
    let directory = tempfile::tempdir().map_err(|error| error.to_string())?;
    let path = directory.path().join(format!("omega-notes.{format}"));
    let mut file = std::fs::File::create(&path).map_err(|error| error.to_string())?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .get(&package.url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_PACKAGE_BYTES as u64)
    {
        return Err("Update package too large".into());
    }
    app.emit(
        "update-download",
        json!({"event":"Started","data":{"contentLength":response.content_length()}}),
    )?;
    let mut size = 0;
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        size += chunk.len();
        if size > MAX_PACKAGE_BYTES {
            return Err("Update package too large".into());
        }
        file.write_all(&chunk).map_err(|error| error.to_string())?;
        app.emit(
            "update-download",
            json!({"event":"Progress","data":{"chunkLength":chunk.len()}}),
        )?;
    }
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    verify(&bytes, &package.signature, &config()?.pubkey)?;
    state
        .pending
        .lock()
        .map_err(|_| "Updater unavailable")?
        .as_mut()
        .ok_or("Updater unavailable")?
        .staged = Some((directory, path));
    app.emit("update-download", json!({"event":"Finished"}))?;
    Ok(())
}
pub(crate) async fn install(app: AppContext, version: String) -> Result<Value, String> {
    let state = app.state::<UpdateState>();
    let _operation = state.operation.lock().await;
    let (path, signature, format) = {
        let pending = state.pending.lock().map_err(|_| "Updater unavailable")?;
        let pending = pending
            .as_ref()
            .filter(|pending| pending.version == version)
            .ok_or("Update is no longer available")?;
        let path = pending
            .staged
            .as_ref()
            .ok_or("Update not downloaded")?
            .1
            .clone();
        (path, pending.package.signature.clone(), pending.format)
    };
    verify(
        &std::fs::read(&path).map_err(|error| error.to_string())?,
        &signature,
        &config()?.pubkey,
    )?;
    crate::runtime::spawn_blocking(move || {
        let manager = match format {
            "deb" => "/usr/bin/apt-get",
            "rpm" => "/usr/bin/dnf",
            _ => return Err("Unsupported package format".into()),
        };
        let output = std::process::Command::new("/usr/bin/pkexec")
            .arg(manager)
            .args(["install", "-y"])
            .arg(&path)
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(format!(
                "Installation canceled or failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(json!({"installed":true}))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_signed_fixture_and_rejects_changed_payload() {
        // Public signing fixture from Zelchi/techdoro; no private key is stored here.
        let bytes = include_bytes!("../test/fixtures/update.txt");
        let signature = include_str!("../test/fixtures/update.txt.sig");
        let key = include_str!("../test/fixtures/update.pub");
        verify(bytes, signature, key).unwrap();
        let mut modified = bytes.to_vec();
        modified[0] ^= 1;
        assert!(verify(&modified, signature, key).is_err());
        assert!(verify(bytes, signature, &config().unwrap().pubkey).is_err());
    }
    #[test]
    fn rejects_unsigned_insecure_and_downgrade_updates() {
        let manifest = |version, url, signature| {
            serde_json::from_value(json!({"version":version,"packages":{format!("{}-{}",std::env::consts::OS,std::env::consts::ARCH):{"rpm":{"url":url,"signature":signature}}}})).unwrap()
        };
        assert!(
            select(manifest("0.4.0", "https://example.com/a.rpm", "sig"), "rpm")
                .unwrap()
                .is_none()
        );
        assert!(select(manifest("9.0.0", "http://example.com/a.rpm", "sig"), "rpm").is_err());
        assert!(select(manifest("9.0.0", "https://example.com/a.rpm", ""), "rpm").is_err());
        assert!(select(manifest("9.0.0", "https://example.com/a.deb", "sig"), "rpm").is_err());
        assert!(
            select(manifest("9.0.0", "https://example.com/a.rpm", "sig"), "rpm")
                .unwrap()
                .is_some()
        );
        assert!(verify(b"tampered", "bad", &config().unwrap().pubkey).is_err());
    }
}
