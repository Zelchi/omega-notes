use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::PathBuf, sync::Mutex};
use tauri::AppHandle;

const FILE_NAME: &str = ".kanban.json";
const MAX_ITEMS: usize = 1000;
const MAX_BYTES: u64 = 4_000_000;
const MAX_DATE_TIMESTAMP: u64 = 8_640_000_000_000_000;
static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Status {
    Backlog,
    ToDo,
    InProgress,
    Review,
    Finish,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    id: String,
    title: String,
    status: Status,
    #[serde(default)]
    position: Option<usize>,
    #[serde(default)]
    created_at: Option<u64>,
    #[serde(default)]
    updated_at: Option<u64>,
}

fn file_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let directory = crate::app::runtime::app_directory(app)?;
    let registry = crate::vaults::read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or("KANBAN_STORAGE_FAILED")?;
    let root = crate::vaults::vault_directory(&directory, vault)?;
    let metadata = fs::symlink_metadata(&root).map_err(|_| "KANBAN_STORAGE_FAILED")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let path = root.join(FILE_NAME);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("KANBAN_STORAGE_FAILED".into()),
    }
    Ok(path)
}

fn read(app: &AppHandle, vault_id: &str) -> Result<Vec<Item>, String> {
    let path = file_path(app, vault_id)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("KANBAN_STORAGE_FAILED".into()),
    };
    if metadata.len() > MAX_BYTES {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let items: Vec<Item> =
        serde_json::from_slice(&fs::read(path).map_err(|_| "KANBAN_STORAGE_FAILED")?)
            .map_err(|_| "KANBAN_STORAGE_FAILED")?;
    validate(&items)?;
    Ok(items)
}

fn validate(items: &[Item]) -> Result<(), String> {
    if items.len() > MAX_ITEMS {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        let id = uuid::Uuid::parse_str(&item.id).map_err(|_| "KANBAN_STORAGE_FAILED")?;
        if id.to_string() != item.id
            || !ids.insert(item.id.as_str())
            || item.title.trim().is_empty()
            || item.title.chars().count() > 500
            || item
                .created_at
                .is_some_and(|timestamp| timestamp > MAX_DATE_TIMESTAMP)
            || item
                .updated_at
                .is_some_and(|timestamp| timestamp > MAX_DATE_TIMESTAMP)
            || item.position.is_some_and(|position| position > MAX_ITEMS)
        {
            return Err("KANBAN_STORAGE_FAILED".into());
        }
    }
    let mut positions = HashSet::with_capacity(items.len());
    for item in items {
        if let Some(position) = item.position {
            if !positions.insert((item.status, position)) {
                return Err("KANBAN_STORAGE_FAILED".into());
            }
        }
    }
    Ok(())
}

fn write(app: &AppHandle, vault_id: &str, items: &[Item]) -> Result<(), String> {
    validate(items)?;
    let bytes = serde_json::to_vec_pretty(items).map_err(|_| "KANBAN_STORAGE_FAILED")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&file_path(app, vault_id)?, &bytes, None)
        .map_err(|_| "KANBAN_STORAGE_FAILED".into())
}

#[tauri::command]
pub(crate) async fn read_kanban(app: AppHandle, vault_id: String) -> Result<Vec<Item>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "KANBAN_STORAGE_FAILED")?;
        read(&app, &vault_id)
    })
    .await
    .map_err(|_| "KANBAN_STORAGE_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn save_kanban(
    app: AppHandle,
    vault_id: String,
    items: Vec<Item>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "KANBAN_STORAGE_FAILED")?;
        write(&app, &vault_id, &items)
    })
    .await
    .map_err(|_| "KANBAN_STORAGE_FAILED".to_string())?
}
