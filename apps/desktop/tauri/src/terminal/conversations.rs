use super::TerminalProvider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};

static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize)]
struct Saved {
    directory: PathBuf,
    id: String,
    #[serde(default)]
    rollout: Option<PathBuf>,
}

pub(super) struct Conversation {
    path: PathBuf,
    root: PathBuf,
    provider: TerminalProvider,
    originator: String,
    codex_home: Option<PathBuf>,
}
pub(super) struct Launch {
    pub arguments: Vec<String>,
    pub conversation: Conversation,
    pub originator: Option<String>,
}

fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}
fn directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path).map_err(|_| "TERMINAL_FAILED".into())
        }
        _ => Err("TERMINAL_FAILED".into()),
    }
}
fn session_lock(folder: &Path) -> Result<fs::File, String> {
    let path = folder.join("antigravity.lock");
    if fs::symlink_metadata(&path)
        .is_ok_and(|meta| !meta.is_file() || meta.file_type().is_symlink())
    {
        return Err("TERMINAL_FAILED".into());
    }
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
        .map_err(|_| "TERMINAL_FAILED")?;
    file.lock().map_err(|_| "TERMINAL_FAILED")?;
    Ok(file)
}

fn small_file(path: &Path) -> Option<Vec<u8>> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16_384 {
        return None;
    }
    let mut data = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(16_385)
        .read_to_end(&mut data)
        .ok()?;
    (data.len() <= 16_384).then_some(data)
}
fn valid_id(provider: TerminalProvider, id: &str) -> bool {
    match provider {
        TerminalProvider::Opencode => {
            id.starts_with("ses_")
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        }
        _ => uuid::Uuid::parse_str(id).is_ok(),
    }
}

fn files(root: &Path, depth: usize, budget: &mut usize, visit: &mut impl FnMut(&Path)) {
    if *budget == 0 || fs::symlink_metadata(root).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let mut entries: Vec<_> = entries.take(*budget).filter_map(Result::ok).collect();
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for entry in entries {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let Ok(meta) = entry.file_type() else {
            continue;
        };
        if meta.is_symlink() {
            continue;
        }
        if meta.is_dir() && depth > 0 {
            files(&entry.path(), depth - 1, budget, visit);
        } else if meta.is_file() {
            visit(&entry.path());
        }
    }
}

fn recorded_uuid(provider: TerminalProvider, id: &str) -> bool {
    let Some(home) = home() else { return false };
    let root = match provider {
        TerminalProvider::Claude => std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".claude"))
            .join("projects"),
        _ => return false,
    };
    let mut found = false;
    files(&root, 2, &mut 10_000, &mut |path| {
        if found {
            return;
        }
        if provider == TerminalProvider::Claude {
            found = path
                .file_name()
                .is_some_and(|name| name == format!("{id}.jsonl").as_str());
        }
    });
    found
}

impl Conversation {
    fn save(&self, id: &str, rollout: Option<PathBuf>) -> Result<(), String> {
        if !valid_id(self.provider, id) {
            return Err("TERMINAL_FAILED".into());
        }
        if fs::symlink_metadata(&self.path)
            .is_ok_and(|meta| !meta.is_file() || meta.file_type().is_symlink())
        {
            return Err("TERMINAL_FAILED".into());
        }
        let data = serde_json::to_vec(&Saved {
            directory: self.root.clone(),
            id: id.into(),
            rollout,
        })
        .map_err(|_| "TERMINAL_FAILED")?;
        crate::storage::atomic_write(&self.path, &data, None).map_err(|_| "TERMINAL_FAILED".into())
    }
    fn codex_metadata(&self, path: &Path) -> Option<(String, SystemTime)> {
        let base = self.codex_home.as_ref()?.join("sessions");
        let canonical = path.canonicalize().ok()?;
        if !canonical.starts_with(base.canonicalize().ok()?) {
            return None;
        }
        let file = fs::File::open(&canonical).ok()?;
        let mut line = String::new();
        BufReader::new(file.take(1_048_576))
            .read_line(&mut line)
            .ok()?;
        let value: Value = serde_json::from_str(&line).ok()?;
        let payload = &value["payload"];
        let id = payload["id"].as_str()?;
        if value["type"] != "session_meta"
            || payload["originator"] != self.originator
            || Path::new(payload["cwd"].as_str()?).canonicalize().ok()? != self.root
            || !valid_id(TerminalProvider::Codex, id)
        {
            return None;
        }
        Some((id.into(), fs::metadata(canonical).ok()?.modified().ok()?))
    }
    pub fn capture(&self) -> Result<(), String> {
        let _guard = STORAGE.lock().map_err(|_| "TERMINAL_FAILED")?;
        self.capture_unlocked()
    }
    fn capture_unlocked(&self) -> Result<(), String> {
        if self.provider != TerminalProvider::Codex {
            return Ok(());
        }
        let Some(home) = &self.codex_home else {
            return Ok(());
        };
        let mut latest: Option<(String, SystemTime, PathBuf)> = small_file(&self.path)
            .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
            .and_then(|saved| saved.rollout)
            .and_then(|path| {
                self.codex_metadata(&path)
                    .map(|(id, time)| (id, time, path))
            });
        files(&home.join("sessions"), 3, &mut 4096, &mut |path| {
            if path.extension().is_some_and(|ext| ext == "jsonl") {
                if let Some((id, time)) = self.codex_metadata(path) {
                    if latest
                        .as_ref()
                        .is_none_or(|(_, previous, _)| time > *previous)
                    {
                        latest = Some((id, time, path.to_path_buf()));
                    }
                }
            }
        });
        if let Some((id, _, path)) = latest {
            self.save(&id, Some(path))?;
        }
        Ok(())
    }
}

pub(super) fn prepare(
    app: &tauri::AppHandle,
    vault_id: &str,
    root: &Path,
    provider: TerminalProvider,
    run_id: &str,
) -> Result<Launch, String> {
    let _guard = STORAGE.lock().map_err(|_| "TERMINAL_FAILED")?;
    let root = root.canonicalize().map_err(|_| "TERMINAL_FAILED")?;
    if provider == TerminalProvider::Antigravity {
        super::antigravity_hooks::sync(
            &root,
            Some((&crate::app::runtime::app_directory(app)?, vault_id, run_id)),
        )?;
    }
    let base = crate::app::runtime::app_directory(app)?
        .join(".key")
        .join("terminal-sessions");
    directory(&base)?;
    let folder = base.join(vault_id);
    directory(&folder)?;
    let _file_lock = if provider == TerminalProvider::Antigravity {
        Some(session_lock(&folder)?)
    } else {
        None
    };
    let conversation = Conversation {
        path: folder.join(format!(
            "{}.json",
            if provider == TerminalProvider::Antigravity {
                "antigravity"
            } else {
                provider.command()
            }
        )),
        root,
        provider,
        originator: format!("omega_notes_gambiarra_{vault_id}"),
        codex_home: std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| home().map(|home| home.join(".codex"))),
    };
    conversation.capture_unlocked()?;
    let saved = match fs::symlink_metadata(&conversation.path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Ok(_) => {
            let bytes = small_file(&conversation.path).ok_or("TERMINAL_FAILED")?;
            let saved: Saved = serde_json::from_slice(&bytes).map_err(|_| "TERMINAL_FAILED")?;
            if !valid_id(provider, &saved.id) {
                return Err("TERMINAL_FAILED".into());
            }
            (saved.directory == conversation.root).then_some(saved)
        }
        Err(_) => return Err("TERMINAL_FAILED".into()),
    };
    let mut arguments = vec![provider.command().to_string()];
    let originator = (provider == TerminalProvider::Codex).then(|| conversation.originator.clone());
    match provider {
        TerminalProvider::Codex => {
            if let Some(saved) = saved.filter(|saved| {
                saved
                    .rollout
                    .as_ref()
                    .and_then(|path| conversation.codex_metadata(path))
                    .is_some_and(|(id, _)| id == saved.id)
            }) {
                arguments.extend(["resume".into(), saved.id]);
            }
        }
        TerminalProvider::Claude => {
            let id = saved
                .map(|saved| saved.id)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let exists = recorded_uuid(provider, &id);
            arguments.extend([
                if exists { "--resume" } else { "--session-id" }.into(),
                id.clone(),
            ]);
            conversation.save(&id, None)?;
        }
        TerminalProvider::Antigravity => {
            let mut resumed = String::new();
            if let Some(saved) = saved {
                let state = crate::ai::antigravity_profile_directory();
                if state.is_some_and(|state| {
                    state.join("antigravity-cli/brain").join(&saved.id).is_dir()
                }) {
                    resumed = saved.id.clone();
                    arguments.extend(["--conversation".into(), saved.id]);
                }
            }
            crate::storage::atomic_write(
                &folder.join("antigravity-run.json"),
                serde_json::json!({"runId":run_id,"conversationId":resumed})
                    .to_string()
                    .as_bytes(),
                None,
            )?;
        }
        TerminalProvider::Opencode => {
            let id = saved
                .map(|saved| saved.id)
                .unwrap_or_else(|| format!("ses_{}", uuid::Uuid::new_v4().simple()));
            conversation.save(&id, None)?;
            arguments.extend(["--session".into(), id]);
        }
    }
    Ok(Launch {
        arguments,
        conversation,
        originator,
    })
}

pub(super) fn record_antigravity(
    directory_root: &Path,
    vault_id: &str,
    root: &Path,
    id: &str,
    run_id: &str,
) -> Result<(), String> {
    let _guard = STORAGE.lock().map_err(|_| "TERMINAL_FAILED")?;
    crate::storage::ensure_key_directory(directory_root)?;
    let base = directory_root.join(".key/terminal-sessions");
    directory(&base)?;
    let folder = base.join(vault_id);
    directory(&folder)?;
    let _file_lock = session_lock(&folder)?;
    let active_path = folder.join("antigravity-run.json");
    let mut active: Value =
        serde_json::from_slice(&small_file(&active_path).ok_or("TERMINAL_FAILED")?)
            .map_err(|_| "TERMINAL_FAILED")?;
    if active["runId"] != run_id {
        return Err("TERMINAL_FAILED".into());
    }
    if active["conversationId"] == id
        && small_file(&folder.join("antigravity.json"))
            .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
            .is_some_and(|saved| saved.id == id && saved.directory == root)
    {
        return Ok(());
    }
    active["conversationId"] = serde_json::json!(id);
    crate::storage::atomic_write(&active_path, active.to_string().as_bytes(), None)?;
    let conversation = Conversation {
        path: folder.join("antigravity.json"),
        root: root.to_path_buf(),
        provider: TerminalProvider::Antigravity,
        originator: String::new(),
        codex_home: None,
    };
    conversation.save(id, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_conversation_can_change_and_old_run_cannot_replace_it() {
        let app = std::env::temp_dir().join(format!("omega-session-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&app).unwrap();
        crate::storage::ensure_key_directory(&app).unwrap();
        let vault = uuid::Uuid::new_v4().to_string();
        let run = uuid::Uuid::new_v4().to_string();
        let first = uuid::Uuid::new_v4().to_string();
        let second = uuid::Uuid::new_v4().to_string();
        let folder = app.join(".key/terminal-sessions").join(&vault);
        fs::create_dir_all(&folder).unwrap();
        let active = folder.join("antigravity-run.json");
        fs::write(
            &active,
            serde_json::json!({"runId":run,"conversationId":""}).to_string(),
        )
        .unwrap();
        record_antigravity(&app, &vault, &app, &first, &run).unwrap();
        record_antigravity(&app, &vault, &app, &second, &run).unwrap();
        let saved: Saved =
            serde_json::from_slice(&fs::read(folder.join("antigravity.json")).unwrap()).unwrap();
        assert_eq!(saved.id, second);
        let state: Value = serde_json::from_slice(&fs::read(&active).unwrap()).unwrap();
        assert_eq!(state["conversationId"], second);
        assert!(record_antigravity(
            &app,
            &vault,
            &app,
            &first,
            &uuid::Uuid::new_v4().to_string()
        )
        .is_err());
        let saved: Saved =
            serde_json::from_slice(&fs::read(folder.join("antigravity.json")).unwrap()).unwrap();
        assert_eq!(saved.id, second);
        fs::remove_dir_all(app).unwrap();
    }
    #[test]
    fn cross_process_lock_child() {
        let Some(folder) = std::env::var_os("OMEGA_SESSION_LOCK_TEST_DIRECTORY") else {
            return;
        };
        let folder = PathBuf::from(folder);
        fs::write(folder.join("ready"), b"").unwrap();
        let _guard = session_lock(&folder).unwrap();
        fs::write(folder.join("acquired"), b"").unwrap();
    }

    #[test]
    fn session_file_lock_serializes_separate_processes() {
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};
        let root = std::env::temp_dir().join(format!("omega-lock-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let guard = session_lock(&root).unwrap();
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "terminal::conversations::tests::cross_process_lock_child",
            ])
            .env("OMEGA_SESSION_LOCK_TEST_DIRECTORY", &root)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !root.join("ready").exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(root.join("ready").exists());
        std::thread::sleep(Duration::from_millis(50));
        assert!(
            !root.join("acquired").exists(),
            "child acquired a lock held by the parent"
        );
        drop(guard);
        let deadline = Instant::now() + Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().unwrap() {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("child did not acquire the released lock");
            }
            std::thread::sleep(Duration::from_millis(5));
        };
        assert!(status.success());
        assert!(root.join("acquired").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
