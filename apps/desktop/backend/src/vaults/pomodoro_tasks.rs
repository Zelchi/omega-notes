use crate::runtime::AppContext;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::PathBuf, sync::Mutex};

const FILE_NAME: &str = ".pomodoro-tasks.json";
const MAX_TASKS: usize = 1000;
const MAX_BYTES: u64 = 4_000_000;
static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Task {
    id: String,
    title: String,
    completed: bool,
    position: usize,
}

fn file_path(app: &AppContext, vault_id: &str) -> Result<PathBuf, String> {
    let directory = crate::app::runtime::app_directory(app)?;
    let registry = crate::vaults::read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or("POMODORO_STORAGE_FAILED")?;
    let root = crate::vaults::vault_directory(&directory, vault)?;
    let metadata = fs::symlink_metadata(&root).map_err(|_| "POMODORO_STORAGE_FAILED")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("POMODORO_STORAGE_FAILED".into());
    }
    let path = root.join(FILE_NAME);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("POMODORO_STORAGE_FAILED".into()),
    }
    Ok(path)
}

fn validate(tasks: &[Task]) -> Result<(), String> {
    if tasks.len() > MAX_TASKS {
        return Err("POMODORO_STORAGE_FAILED".into());
    }
    let mut ids = HashSet::with_capacity(tasks.len());
    let mut positions = HashSet::with_capacity(tasks.len());
    for task in tasks {
        let id = uuid::Uuid::parse_str(&task.id).map_err(|_| "POMODORO_STORAGE_FAILED")?;
        if id.to_string() != task.id
            || !ids.insert(task.id.as_str())
            || task.title.trim().is_empty()
            || task.title.chars().count() > 500
            || task.position >= MAX_TASKS
            || !positions.insert(task.position)
        {
            return Err("POMODORO_STORAGE_FAILED".into());
        }
    }
    Ok(())
}

fn read(app: &AppContext, vault_id: &str) -> Result<Vec<Task>, String> {
    let path = file_path(app, vault_id)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("POMODORO_STORAGE_FAILED".into()),
    };
    if metadata.len() > MAX_BYTES {
        return Err("POMODORO_STORAGE_FAILED".into());
    }
    let tasks: Vec<Task> =
        serde_json::from_slice(&fs::read(path).map_err(|_| "POMODORO_STORAGE_FAILED")?)
            .map_err(|_| "POMODORO_STORAGE_FAILED")?;
    validate(&tasks)?;
    Ok(tasks)
}

fn write(app: &AppContext, vault_id: &str, tasks: &[Task]) -> Result<(), String> {
    validate(tasks)?;
    let bytes = serde_json::to_vec_pretty(tasks).map_err(|_| "POMODORO_STORAGE_FAILED")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("POMODORO_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&file_path(app, vault_id)?, &bytes, None)
        .map_err(|_| "POMODORO_STORAGE_FAILED".into())
}

pub(crate) async fn read_pomodoro_tasks(
    app: AppContext,
    vault_id: String,
) -> Result<Vec<Task>, String> {
    crate::runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "POMODORO_STORAGE_FAILED")?;
        read(&app, &vault_id)
    })
    .await
    .map_err(|_| "POMODORO_STORAGE_FAILED".to_string())?
}

pub(crate) async fn save_pomodoro_tasks(
    app: AppContext,
    vault_id: String,
    tasks: Vec<Task>,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "POMODORO_STORAGE_FAILED")?;
        write(&app, &vault_id, &tasks)
    })
    .await
    .map_err(|_| "POMODORO_STORAGE_FAILED".to_string())?
}
