use crate::{app::runtime, storage::atomic_write, vaults};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

static CHAT_STORAGE: Mutex<()> = Mutex::new(());
const MAX_BYTES: u64 = 16 * 1024 * 1024;
const MAX_MESSAGES: usize = 50;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Provider {
    Codex,
    Claude,
    Opencode,
}

impl Provider {
    fn filename(self) -> &'static str {
        match self {
            Self::Codex => "codex.json",
            Self::Claude => "claude.json",
            Self::Opencode => "opencode.json",
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Role {
    User,
    Assistant,
}

#[derive(Deserialize, Serialize)]
pub(crate) struct Message {
    pub id: String,
    pub role: Role,
    pub text: String,
}

#[derive(Default, Deserialize, Serialize)]
pub(crate) struct Chat {
    pub messages: Vec<Message>,
    pub draft: String,
    pub model: String,
    pub effort: String,
    pub fast: bool,
}

fn trim_history(chat: &mut Chat) -> bool {
    let excess = chat.messages.len().saturating_sub(MAX_MESSAGES);
    if excess == 0 {
        return false;
    }
    drop(chat.messages.drain(..excess));
    true
}

fn write_chat(path: &Path, chat: &Chat) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(chat).map_err(|_| "AI_STORAGE_FAILED")?;
    if contents.len() as u64 > MAX_BYTES {
        return Err("AI_STORAGE_FAILED".into());
    }
    atomic_write(path, &contents, None).map_err(|_| "AI_STORAGE_FAILED".into())
}

fn path(app: &tauri::AppHandle, id: &str, provider: Provider) -> Result<PathBuf, String> {
    let directory = runtime::app_directory(app)?;
    let registry = vaults::read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == id)
        .ok_or("AI_INVALID_VAULT")?;
    let root = vaults::vault_directory(&directory, vault)?;
    for folder in [directory.join("vaults"), root.clone()] {
        let metadata = fs::symlink_metadata(folder).map_err(|_| "AI_INVALID_VAULT")?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("AI_INVALID_VAULT".into());
        }
    }
    let folder = root.join("ia");
    match fs::symlink_metadata(&folder) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("AI_INVALID_VAULT".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&folder).map_err(|_| "AI_STORAGE_FAILED")?
        }
        Err(_) => return Err("AI_STORAGE_FAILED".into()),
    }
    let path = folder.join(provider.filename());
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err("AI_STORAGE_FAILED".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("AI_STORAGE_FAILED".into()),
    }
    Ok(path)
}

pub(crate) fn read(app: &tauri::AppHandle, id: &str, provider: Provider) -> Result<Chat, String> {
    let _guard = CHAT_STORAGE.lock().map_err(|_| "AI_STORAGE_FAILED")?;
    let path = path(app, id, provider)?;
    match fs::metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Chat::default()),
        Ok(metadata) if metadata.len() <= MAX_BYTES => {}
        _ => return Err("AI_STORAGE_FAILED".into()),
    }
    let contents = fs::read(&path).map_err(|_| "AI_STORAGE_FAILED")?;
    let mut chat: Chat = serde_json::from_slice(&contents).map_err(|_| "AI_STORAGE_FAILED")?;
    if trim_history(&mut chat) {
        write_chat(&path, &chat)?;
    }
    Ok(chat)
}

pub(crate) fn save(
    app: &tauri::AppHandle,
    id: &str,
    provider: Provider,
    mut chat: Chat,
) -> Result<(), String> {
    let _guard = CHAT_STORAGE.lock().map_err(|_| "AI_STORAGE_FAILED")?;
    let path = path(app, id, provider)?;
    trim_history(&mut chat);
    write_chat(&path, &chat)
}

pub(crate) fn clear_all(app: &tauri::AppHandle) -> Result<(), String> {
    let _guard = CHAT_STORAGE.lock().map_err(|_| "AI_STORAGE_FAILED")?;
    let directory = runtime::app_directory(app)?;
    let registry = vaults::read_vault_registry(&directory)?;
    let base = directory.join("vaults");
    match fs::symlink_metadata(&base) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        _ => return Err("AI_STORAGE_FAILED".into()),
    }
    let mut failed = false;
    for vault in registry.vaults {
        let root = vaults::vault_directory(&directory, &vault)?;
        let folder = root.join("ia");
        let mut safe = true;
        for path in [&root, &folder] {
            match fs::symlink_metadata(path) {
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    safe = false;
                    break;
                }
                _ => {
                    failed = true;
                    safe = false;
                    break;
                }
            }
        }
        if !safe {
            continue;
        }
        for provider in [Provider::Codex, Provider::Claude, Provider::Opencode] {
            match fs::remove_file(folder.join(provider.filename())) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => failed = true,
            }
        }
    }
    if failed {
        Err("AI_STORAGE_FAILED".into())
    } else {
        Ok(())
    }
}
