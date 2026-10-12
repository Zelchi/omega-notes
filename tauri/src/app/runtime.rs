use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::vaults;

#[derive(Clone)]
pub(crate) struct ActiveVaultDirectories {
    pub(crate) notes: PathBuf,
    pub(crate) backups: PathBuf,
}

pub(crate) struct ActiveVault(pub(crate) Mutex<Option<ActiveVaultDirectories>>);

pub(crate) fn app_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta Documentos: {error}"))?;
    vaults::ensure_app_directory(&documents)
}

pub(crate) fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    notes_and_backups_dirs(app).map(|(notes, _)| notes)
}

pub(crate) fn notes_and_backups_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    app.state::<ActiveVault>()
        .0
        .lock()
        .map_err(|_| "Não foi possível acessar o vault ativo.".to_string())?
        .as_ref()
        .map(|directories| (directories.notes.clone(), directories.backups.clone()))
        .ok_or_else(|| "NO_ACTIVE_VAULT".to_string())
}

pub(crate) fn set_active_vault(
    app: &AppHandle,
    directories: Option<(PathBuf, PathBuf)>,
    failure_message: &str,
) -> Result<(), String> {
    *app.state::<ActiveVault>()
        .0
        .lock()
        .map_err(|_| failure_message.to_string())? =
        directories.map(|(notes, backups)| ActiveVaultDirectories { notes, backups });
    Ok(())
}
