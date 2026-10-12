use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::models::{Vault, VaultRegistry};
use crate::storage::atomic_write;
use uuid::Uuid;

pub(super) struct VaultDeletionStage {
    source_path: PathBuf,
    quarantine_path: PathBuf,
}

pub(crate) fn ensure_app_directory(documents: &Path) -> Result<PathBuf, String> {
    let app_directory = documents.join("Ômega Notes");
    fs::create_dir_all(&app_directory)
        .map_err(|error| format!("Não foi possível criar a pasta Ômega Notes: {error}"))?;
    let temporary_directory = app_directory.join(".temp");
    fs::create_dir_all(&temporary_directory)
        .map_err(|error| format!("Não foi possível criar a pasta .temp: {error}"))?;
    Ok(app_directory)
}

fn vault_registry_path(directory: &Path) -> PathBuf {
    directory.join("vaults.json")
}

fn empty_vault_registry() -> VaultRegistry {
    VaultRegistry {
        version: 1,
        active_vault_id: None,
        vaults: Vec::new(),
    }
}

pub(crate) fn read_vault_registry(directory: &Path) -> Result<VaultRegistry, String> {
    let path = vault_registry_path(directory);
    if !path.is_file() {
        return Ok(empty_vault_registry());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Não foi possível ler os vaults: {error}"))?;
    let registry: VaultRegistry = serde_json::from_str(&contents)
        .map_err(|error| format!("Não foi possível interpretar os vaults: {error}"))?;
    if registry.version != 1 {
        return Err("Formato da lista de vaults incompatível.".to_string());
    }
    Ok(registry)
}

pub(crate) fn write_vault_registry(
    directory: &Path,
    registry: &VaultRegistry,
) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(registry)
        .map_err(|error| format!("Não foi possível preparar a lista de vaults: {error}"))?;
    atomic_write(&vault_registry_path(directory), &contents, None)
}

pub(crate) fn vault_directory(directory: &Path, vault: &Vault) -> Result<PathBuf, String> {
    Uuid::parse_str(&vault.id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    Ok(directory.join("vaults").join(&vault.id))
}

pub(crate) fn vault_backups_directory(directory: &Path, vault_id: &str) -> PathBuf {
    directory.join(".temp").join(vault_id)
}

pub(crate) fn vault_notes_dir(directory: &Path, vault: &Vault) -> Result<PathBuf, String> {
    Ok(vault_directory(directory, vault)?.join("notes"))
}

pub(crate) fn existing_vault_notes_dir(
    directory: &Path,
    vault: &Vault,
) -> Result<Option<PathBuf>, String> {
    let notes_directory = vault_notes_dir(directory, vault)?;
    Ok(notes_directory.is_dir().then_some(notes_directory))
}

pub(super) fn ensure_vault_directories(path: &Path) -> Result<(), std::io::Error> {
    for folder in ["notes", "images", "audios", "videos"] {
        fs::create_dir_all(path.join(folder))?;
    }
    Ok(())
}

pub(super) fn remove_vault_directory(path: &Path) -> Result<(), std::io::Error> {
    fs::remove_dir_all(path)
}

pub(super) fn stage_vault_deletion(
    directory: &Path,
    vault: &Vault,
) -> Result<Option<VaultDeletionStage>, String> {
    let source_path = vault_directory(directory, vault)?;
    let vaults_directory = directory.join("vaults");
    fs::create_dir_all(&vaults_directory)
        .map_err(|error| format!("Não foi possível acessar as pastas de vaults: {error}"))?;
    if !source_path.is_dir() {
        return Ok(None);
    }

    let quarantine_path = vaults_directory.join(format!(".{}.deleting", Uuid::now_v7()));
    fs::rename(&source_path, &quarantine_path)
        .map_err(|error| format!("Não foi possível preparar a exclusão do vault: {error}"))?;
    Ok(Some(VaultDeletionStage {
        source_path,
        quarantine_path,
    }))
}

pub(super) fn restore_vault_deletion(stage: &VaultDeletionStage) -> Result<(), std::io::Error> {
    fs::rename(&stage.quarantine_path, &stage.source_path)
}

pub(super) fn cleanup_vault_deletion(stage: VaultDeletionStage) -> Option<String> {
    fs::remove_dir_all(stage.quarantine_path)
        .err()
        .map(|error| error.to_string())
}

pub(super) fn remove_vault_backups_directory(
    directory: &Path,
    vault_id: &str,
) -> Result<(), std::io::Error> {
    match fs::remove_dir_all(vault_backups_directory(directory, vault_id)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub(crate) fn vault_storage_stats(directory: &Path) -> Result<(u64, u64), String> {
    let mut pending_directories = vec![directory.to_path_buf()];
    let mut storage_bytes = 0_u64;
    let mut last_modified_at = 0_u64;

    while let Some(current_directory) = pending_directories.pop() {
        let entries = fs::read_dir(current_directory)
            .map_err(|error| format!("Não foi possível ler os arquivos do vault: {error}"))?;
        for entry in entries {
            let entry = entry
                .map_err(|error| format!("Não foi possível ler um arquivo do vault: {error}"))?;
            let file_type = entry.file_type().map_err(|error| {
                format!("Não foi possível identificar um arquivo do vault: {error}")
            })?;
            if file_type.is_dir() {
                pending_directories.push(entry.path());
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let metadata = entry.metadata().map_err(|error| {
                format!("Não foi possível ler os dados de um arquivo do vault: {error}")
            })?;
            storage_bytes = storage_bytes.saturating_add(metadata.len());
            if let Ok(modified_at) = metadata.modified() {
                if let Ok(duration) = modified_at.duration_since(UNIX_EPOCH) {
                    last_modified_at = last_modified_at.max(duration.as_millis() as u64);
                }
            }
        }
    }

    Ok((storage_bytes, last_modified_at))
}
