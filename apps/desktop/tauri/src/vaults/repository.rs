use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::models::{Vault, VaultRegistry};
use crate::storage::atomic_write;
use uuid::Uuid;

pub(super) struct VaultDeletionStage {
    source_path: PathBuf,
    quarantine_path: PathBuf,
    manifest_path: PathBuf,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct VaultDeletionManifest {
    version: u8,
    vault_id: String,
}

fn vault_deletion_manifest_path(vaults_directory: &Path, vault_id: &str) -> PathBuf {
    vaults_directory.join(format!(".vault-delete-{vault_id}.json"))
}

fn read_vault_deletion_manifest(path: &Path, expected_id: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Não foi possível verificar os dados de recuperação: {error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 4096 {
        return Err("Manifesto de recuperação de vault inválido.".into());
    }
    let manifest: VaultDeletionManifest =
        serde_json::from_slice(&fs::read(path).map_err(|_| "VAULT_RECOVERY_FAILED")?)
            .map_err(|_| "Manifesto de recuperação de vault inválido.")?;
    if manifest.version != 1 || manifest.vault_id != expected_id {
        return Err("Manifesto de recuperação de vault inválido.".into());
    }
    Ok(())
}

pub(crate) fn ensure_app_directory(app_directory: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(app_directory)
        .map_err(|error| format!("Não foi possível criar a pasta de dados: {error}"))?;
    crate::storage::ensure_key_directory(app_directory)?;
    let temporary_directory = app_directory.join(".temp");
    fs::create_dir_all(&temporary_directory)
        .map_err(|error| format!("Não foi possível criar a pasta .temp: {error}"))?;
    Ok(app_directory.to_path_buf())
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
    for folder in ["notes", "images", "audios", "videos", "ia"] {
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
    match fs::symlink_metadata(&source_path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        _ => return Err("A pasta do vault não é um diretório seguro.".into()),
    }

    let quarantine_path = vaults_directory.join(format!(".vault-delete-{}.deleting", vault.id));
    let manifest_path = vault_deletion_manifest_path(&vaults_directory, &vault.id);
    for path in [&quarantine_path, &manifest_path] {
        match fs::symlink_metadata(path) {
            Ok(_) => {
                return Err("Já existe uma operação de exclusão pendente para este vault.".into())
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Não foi possível verificar uma operação pendente: {error}"
                ))
            }
        }
    }
    let manifest = VaultDeletionManifest {
        version: 1,
        vault_id: vault.id.clone(),
    };
    let manifest_bytes = serde_json::to_vec(&manifest).map_err(|_| "VAULT_RECOVERY_FAILED")?;
    atomic_write(&manifest_path, &manifest_bytes, None)?;
    if let Err(error) = fs::rename(&source_path, &quarantine_path) {
        let _ = fs::remove_file(&manifest_path);
        return Err(format!(
            "Não foi possível preparar a exclusão do vault: {error}"
        ));
    }
    Ok(Some(VaultDeletionStage {
        source_path,
        quarantine_path,
        manifest_path,
    }))
}

pub(crate) fn recover_vault_deletions(
    directory: &Path,
    registry: &super::models::VaultRegistry,
) -> Result<(), String> {
    let vaults_directory = directory.join("vaults");
    let entries = match fs::read_dir(&vaults_directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Não foi possível recuperar exclusões de vault: {error}"
            ))
        }
    };

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Não foi possível ler as pastas de vault: {error}"))?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(vault_id) = name
            .strip_prefix(".vault-delete-")
            .and_then(|name| name.strip_suffix(".deleting"))
        else {
            continue;
        };
        let parsed_id = Uuid::parse_str(vault_id)
            .map_err(|_| "Pasta de recuperação de vault inválida.".to_string())?;
        if parsed_id.to_string() != vault_id {
            return Err("Pasta de recuperação de vault inválida.".into());
        }
        let stage_path = entry.path();
        let metadata = fs::symlink_metadata(&stage_path).map_err(|error| {
            format!("Não foi possível verificar uma pasta de recuperação: {error}")
        })?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Pasta de recuperação de vault inválida.".into());
        }

        let source_path = vaults_directory.join(vault_id);
        let manifest_path = vault_deletion_manifest_path(&vaults_directory, vault_id);
        let has_manifest = match fs::symlink_metadata(&manifest_path) {
            Ok(_) => {
                read_vault_deletion_manifest(&manifest_path, vault_id)?;
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(format!(
                    "Não foi possível verificar os dados de recuperação: {error}"
                ));
            }
        };
        if registry.vaults.iter().any(|vault| vault.id == vault_id) {
            if source_path.exists() {
                return Err("O vault existe na pasta original e na área de recuperação.".into());
            }
            fs::rename(&stage_path, &source_path).map_err(|error| {
                format!("Não foi possível restaurar o vault interrompido: {error}")
            })?;
            if has_manifest {
                let _ = fs::remove_file(manifest_path);
            }
        } else if has_manifest {
            fs::remove_dir_all(&stage_path).map_err(|error| {
                format!("Não foi possível finalizar a exclusão interrompida: {error}")
            })?;
            let _ = fs::remove_file(manifest_path);
        }
    }

    let entries = fs::read_dir(&vaults_directory)
        .map_err(|error| format!("Não foi possível ler as pastas de vault: {error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Não foi possível ler as pastas de vault: {error}"))?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(vault_id) = name
            .strip_prefix(".vault-delete-")
            .and_then(|name| name.strip_suffix(".json"))
        else {
            continue;
        };
        let parsed_id = Uuid::parse_str(vault_id)
            .map_err(|_| "Manifesto de recuperação de vault inválido.".to_string())?;
        if parsed_id.to_string() != vault_id {
            return Err("Manifesto de recuperação de vault inválido.".into());
        }
        let manifest_path = entry.path();
        read_vault_deletion_manifest(&manifest_path, vault_id)?;
        let stage_path = vaults_directory.join(format!(".vault-delete-{vault_id}.deleting"));
        match fs::symlink_metadata(&stage_path) {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::remove_file(manifest_path).map_err(|error| {
                    format!("Não foi possível limpar os dados de recuperação: {error}")
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "Não foi possível verificar uma pasta de recuperação: {error}"
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn restore_vault_deletion(stage: &VaultDeletionStage) -> Result<(), std::io::Error> {
    fs::rename(&stage.quarantine_path, &stage.source_path)?;
    let _ = fs::remove_file(&stage.manifest_path);
    Ok(())
}

pub(super) fn cleanup_vault_deletion(stage: VaultDeletionStage) -> Option<String> {
    if let Err(error) = fs::remove_dir_all(stage.quarantine_path) {
        return Some(error.to_string());
    }
    fs::remove_file(stage.manifest_path)
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
