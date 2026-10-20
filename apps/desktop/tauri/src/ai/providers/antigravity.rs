use super::process::{self, Executable};
use crate::ai::task::Purpose;
use serde_json::{json, Value};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
};

pub(super) fn supported_version(version: &str) -> bool {
    version.split_whitespace().any(|part| {
        let mut parts = part.trim_start_matches('v').split('.');
        let major = parts.next().and_then(|part| part.parse::<u32>().ok());
        let minor = parts.next().and_then(|part| part.parse::<u32>().ok());
        let patch = parts.next().and_then(|part| part.split('-').next()?.parse::<u32>().ok());
        matches!((major, minor, patch), (Some(major), Some(minor), Some(patch)) if (major, minor, patch) >= (1, 4, 2))
    })
}

pub(crate) fn profile_directory() -> Option<PathBuf> {
    std::env::var_os("ANTIGRAVITY_GEMINI_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .map(|home| PathBuf::from(home).join(".gemini"))
        })
}
fn limited_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Ok(meta) if meta.is_file() && meta.len() <= 1_048_576 => {
            let mut bytes = Vec::new();
            fs::File::open(path)
                .map_err(|_| "AI_STORAGE_FAILED")?
                .take(1_048_577)
                .read_to_end(&mut bytes)
                .map_err(|_| "AI_STORAGE_FAILED")?;
            if bytes.len() > 1_048_576 {
                return Err("AI_STORAGE_FAILED".into());
            }
            Ok(Some(bytes))
        }
        _ => Err("AI_STORAGE_FAILED".into()),
    }
}

pub(super) fn models(binary: &Executable) -> Result<Value, String> {
    let mut models = vec![
        json!({"id":"","name":"Default","isDefault":true,"defaultEffort":"","efforts":[],"serviceTiers":[]}),
    ];
    let mut command = process::command(binary);
    command
        .arg("models")
        .env("AGY_CLI_DISABLE_AUTO_UPDATE", "true")
        .env("NO_COLOR", "1");
    if let Ok((true, output)) = process::output(command) {
        let mut seen = std::collections::HashSet::new();
        for line in output.lines() {
            let mut parts = line.split_whitespace();
            let Some(id) = parts.next() else { continue };
            if id.len() > 200
                || !id.contains('-')
                || !id.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-._/".contains(&byte)
                })
                || !seen.insert(id.to_string())
            {
                continue;
            }
            let label = parts.collect::<Vec<_>>().join(" ");
            models.push(json!({"id":id,"name":if label.is_empty(){id}else{&label},"isDefault":false,"defaultEffort":"","efforts":[],"serviceTiers":[]}));
        }
    }
    Ok(json!(models))
}

pub(crate) fn clean(root: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(root).map_err(|_| "AI_STORAGE_FAILED")?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("AI_STORAGE_FAILED".into());
    }
    for entry in fs::read_dir(root).map_err(|_| "AI_STORAGE_FAILED")? {
        let entry = entry.map_err(|_| "AI_STORAGE_FAILED")?;
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| "AI_STORAGE_FAILED")?;
        if meta.is_dir() && !meta.file_type().is_symlink() {
            fs::remove_dir_all(entry.path())
        } else {
            fs::remove_file(entry.path())
        }
        .map_err(|_| "AI_STORAGE_FAILED")?;
    }
    Ok(())
}

pub(super) fn configure(
    command: &mut Command,
    root: &Path,
    mcp: Value,
    purpose: Purpose,
    model: Option<&str>,
) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        let state = root.join("state");
        let config = state.join("config");
        let cli = state.join("antigravity-cli");
        for path in [&state, &config, &cli] {
            fs::create_dir(path).map_err(|_| "AI_STORAGE_FAILED")?;
        }
        let mut settings = json!({
            "enableTelemetry":false, "allowNonWorkspaceAccess":false,
            "permissions":{
                "deny":["read_file(*)","write_file(*)","command(*)","unsandboxed(*)","read_url(*)","execute_url(*)"],
                "allow":crate::ai::tools::names().into_iter().filter(|name| crate::ai::tools::allowed_for(purpose,name)).map(|name|format!("mcp(omega/{name})")).collect::<Vec<_>>()
            }
        });
        if let Some(source) = profile_directory() {
            if let Some(bytes) = limited_file(&source.join("antigravity-cli/settings.json"))? {
                let original: Value =
                    serde_json::from_slice(&bytes).map_err(|_| "AI_STORAGE_FAILED")?;
                for key in ["modelProvider", "model", "effort"] {
                    if let Some(value) = original
                        .get(key)
                        .filter(|value| value.as_str().is_some_and(|text| !text.trim().is_empty()))
                    {
                        settings[key] = value.clone();
                    }
                }
                if let Some(value) = original
                    .get("useAiCredits")
                    .filter(|value| value.is_boolean())
                {
                    settings["useAiCredits"] = value.clone();
                }
            }
            if let Some(bytes) =
                limited_file(&source.join("antigravity-cli/antigravity-oauth-token"))?
            {
                let path = cli.join("antigravity-oauth-token");
                crate::storage::atomic_write(&path, &bytes, None)?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
                        .map_err(|_| "AI_STORAGE_FAILED")?;
                }
            }
        }
        crate::storage::atomic_write(
            &cli.join("settings.json"),
            settings.to_string().as_bytes(),
            None,
        )?;
        let mut mcp = mcp;
        let disabled = crate::ai::tools::names()
            .into_iter()
            .filter(|name| !crate::ai::tools::allowed_for(purpose, name))
            .collect::<Vec<_>>();
        mcp["mcpServers"]["omega"]["disabledTools"] = json!(disabled);
        crate::storage::atomic_write(
            &config.join("mcp_config.json"),
            mcp.to_string().as_bytes(),
            None,
        )?;
        let agents = config.join("agents");
        fs::create_dir(&agents).map_err(|_| "AI_STORAGE_FAILED")?;
        let agent = format!("---\nname: omega\ndescription: Omega Notes vault assistant\nmainAgent: true\nsubagent: false\ninheritCustomizations: true\ntools: []\nskills: []\nplugins: []\n---\n\n{}", purpose.instructions());
        crate::storage::atomic_write(&agents.join("omega.md"), agent.as_bytes(), None)?;
        let binary = std::env::current_exe().map_err(|_| "AI_START_FAILED")?;
        let hook = crate::terminal::hook_command(&[
            binary.to_string_lossy().into_owned(),
            "--omega-agy-guard".into(),
            purpose.name().into(),
        ])?;
        let hooks = json!({"omega-scope":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":hook,"timeout":10}]}]}});
        crate::storage::atomic_write(
            &config.join("hooks.json"),
            hooks.to_string().as_bytes(),
            None,
        )?;
        command
            .args([
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--agent",
                "omega",
                "--disable-slash-commands",
                "--print-timeout",
                "15m",
                "--gemini_dir",
            ])
            .arg(&state)
            .arg("--log-file")
            .arg(root.join("cli.log"))
            .env("AGY_CLI_DISABLE_AUTO_UPDATE", "true")
            .env("NO_COLOR", "1")
            .env_remove("ANTIGRAVITY_GEMINI_DIR");
        if let Some(model) = model.filter(|model| !model.is_empty()) {
            command.args(["--model", model]);
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = clean(root);
    }
    result
}

pub(super) fn error_code(message: &str) -> &'static str {
    let message = message.to_ascii_lowercase();
    if message.contains("mcp")
        && (message.contains("failed")
            || message.contains("error")
            || message.contains("could not"))
    {
        "AI_ANTIGRAVITY_MCP_FAILED"
    } else if message.contains("429")
        || message.contains("quota")
        || message.contains("resource_exhausted")
        || message.contains("rate limit")
        || message.contains("credits")
    {
        "AI_ANTIGRAVITY_LIMIT_REACHED"
    } else if message.contains("401")
        || message.contains("invalid_grant")
        || message.contains("unauthenticated")
        || message.contains("authentication")
        || message.contains("sign in")
        || message.contains("log in")
        || message.contains("api key")
    {
        "AI_ANTIGRAVITY_AUTH_FAILED"
    } else if message.contains("403")
        || message.contains("permission_denied")
        || message.contains("permission denied")
    {
        "AI_ANTIGRAVITY_ACCESS_DENIED"
    } else if message.contains("model")
        && (message.contains("not found")
            || message.contains("not available")
            || message.contains("unsupported")
            || message.contains("not recognized"))
    {
        "AI_ANTIGRAVITY_MODEL_UNAVAILABLE"
    } else if message.contains("fetch failed")
        || message.contains("enotfound")
        || message.contains("econn")
        || message.contains("network")
        || message.contains("connection refused")
    {
        "AI_ANTIGRAVITY_CONNECTION_FAILED"
    } else {
        "AI_ANTIGRAVITY_REQUEST_FAILED"
    }
}
