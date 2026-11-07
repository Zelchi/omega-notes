use std::path::PathBuf;
use std::sync::Mutex;

use crate::runtime::AppContext;

use crate::vaults;

#[derive(Clone)]
pub(crate) struct ActiveVaultDirectories {
    pub(crate) id: String,
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

pub(crate) fn notes_dir_for_vault(app: &AppContext, vault_id: &str) -> Result<PathBuf, String> {
    let active = app
        .state::<ActiveVault>()
        .0
        .lock()
        .map_err(|_| "Não foi possível acessar o vault ativo.".to_string())?;
    let directories = active
        .as_ref()
        .filter(|directories| directories.id == vault_id)
        .ok_or_else(|| "NOTE_IMAGE_VAULT_CHANGED".to_string())?;
    Ok(directories.notes.clone())
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
    vault_id: Option<String>,
    directories: Option<(PathBuf, PathBuf)>,
    failure_message: &str,
) -> Result<(), String> {
    if directories.is_some() != vault_id.is_some()
        || vault_id
            .as_ref()
            .is_some_and(|id| match uuid::Uuid::parse_str(id) {
                Ok(parsed) => parsed.to_string() != *id,
                Err(_) => true,
            })
    {
        return Err(failure_message.to_string());
    }
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
    let next_active = vault_id
        .as_ref()
        .zip(directories.as_ref())
        .map(|(id, (notes, _))| (id, notes));
    let changed = active.as_ref().map(|value| (&value.id, &value.notes)) != next_active;
    *active = directories.map(|(notes, backups)| ActiveVaultDirectories {
        id: vault_id.expect("validated active vault id"),
        notes,
        backups,
    });
    drop(active);
    if changed {
        app.state::<crate::terminal::TerminalState>().shutdown();
    }
    Ok(())
}
