use std::path::PathBuf;
use std::sync::Mutex;

use crate::runtime::AppContext;

use crate::vaults;

#[derive(Clone)]
pub(crate) struct ActiveVaultDirectories {
    pub(crate) notes: PathBuf,
    pub(crate) backups: PathBuf,
}

pub(crate) struct ActiveVault(pub(crate) Mutex<Option<ActiveVaultDirectories>>);

#[cfg(debug_assertions)]
const DATA_DIRECTORY_NAME: &str = "Ômega Notes Dev";
#[cfg(not(debug_assertions))]
const DATA_DIRECTORY_NAME: &str = "Ômega Notes";

pub(crate) fn app_directory(app: &AppContext) -> Result<PathBuf, String> {
    let documents = app
        .documents_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta Documentos: {error}"))?;
    vaults::ensure_app_directory(&documents.join(DATA_DIRECTORY_NAME))
}

pub(crate) fn notes_dir(app: &AppContext) -> Result<PathBuf, String> {
    notes_and_backups_dirs(app).map(|(notes, _)| notes)
}

pub(crate) fn notes_and_backups_dirs(app: &AppContext) -> Result<(PathBuf, PathBuf), String> {
    app.state::<ActiveVault>()
        .0
        .lock()
        .map_err(|_| "Não foi possível acessar o vault ativo.".to_string())?
        .as_ref()
        .map(|directories| (directories.notes.clone(), directories.backups.clone()))
        .ok_or_else(|| "NO_ACTIVE_VAULT".to_string())
}

pub(crate) fn set_active_vault(
    app: &AppContext,
    directories: Option<(PathBuf, PathBuf)>,
    failure_message: &str,
) -> Result<(), String> {
    let directories = directories
        .map(|(notes, backups)| -> Result<_, String> {
            Ok((
                notes
                    .canonicalize()
                    .map_err(|_| failure_message.to_string())?,
                backups
                    .canonicalize()
                    .map_err(|_| failure_message.to_string())?,
            ))
        })
        .transpose()?;
    let state = app.state::<ActiveVault>();
    let mut active = state.0.lock().map_err(|_| failure_message.to_string())?;
    let changed =
        active.as_ref().map(|value| &value.notes) != directories.as_ref().map(|(notes, _)| notes);
    *active = directories.map(|(notes, backups)| ActiveVaultDirectories { notes, backups });
    drop(active);
    if changed {
        app.state::<crate::terminal::TerminalState>().shutdown();
    }
    Ok(())
}
