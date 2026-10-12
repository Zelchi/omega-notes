use std::path::PathBuf;
use uuid::Uuid;

use crate::names::normalize_name;

use super::models::{Vault, VaultDeleteResult, VaultLibrary};
use super::repository::{
    cleanup_vault_deletion, ensure_vault_directories, read_vault_registry,
    remove_vault_backups_directory, remove_vault_directory, restore_vault_deletion,
    stage_vault_deletion, vault_backups_directory, vault_directory, vault_notes_dir,
    write_vault_registry,
};

fn active_vault_directories(
    directory: &PathBuf,
    vault: &super::models::Vault,
) -> Result<(PathBuf, PathBuf), String> {
    let notes_directory = vault_notes_dir(directory, vault)?;
    ensure_vault_directories(&vault_directory(directory, vault)?)
        .map_err(|error| format!("Não foi possível abrir o vault: {error}"))?;
    let backups_directory = vault_backups_directory(directory, &vault.id);
    std::fs::create_dir_all(&backups_directory).map_err(|error| {
        format!("Não foi possível abrir os arquivos temporários do vault: {error}")
    })?;
    Ok((notes_directory, backups_directory))
}

pub(crate) fn initialize_active_vault(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    set_active_vault: &impl Fn(Option<(PathBuf, PathBuf)>, &str) -> Result<(), String>,
) -> Result<(), String> {
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let active_directories = registry
        .active_vault_id
        .as_ref()
        .and_then(|active_id| registry.vaults.iter().find(|vault| &vault.id == active_id))
        .map(|vault| active_vault_directories(&directory, vault))
        .transpose()?;

    if let Some(directories) = active_directories {
        set_active_vault(Some(directories), "Não foi possível ativar o vault.")?;
    } else if registry.active_vault_id.is_some() {
        registry.active_vault_id = None;
        write_vault_registry(&directory, &registry)?;
    }

    Ok(())
}

pub(super) fn list_vaults(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
) -> Result<VaultLibrary, String> {
    let directory = resolve_app_directory()?;
    let registry = read_vault_registry(&directory)?;
    Ok(VaultLibrary {
        vaults: registry.vaults,
        active_vault_id: registry.active_vault_id,
    })
}

pub(super) fn create_vault(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    name: String,
) -> Result<VaultLibrary, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("EMPTY_VAULT_NAME".to_string());
    }
    if name.chars().count() > 64 {
        return Err("VAULT_NAME_TOO_LONG".to_string());
    }
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let normalized_name = normalize_name(name);
    if registry
        .vaults
        .iter()
        .any(|vault| normalize_name(&vault.name) == normalized_name)
    {
        return Err("DUPLICATE_VAULT_NAME".to_string());
    }

    let vault = Vault {
        id: Uuid::now_v7().to_string(),
        name: name.to_string(),
    };
    let vault_directory = vault_directory(&directory, &vault)?;
    ensure_vault_directories(&vault_directory)
        .map_err(|error| format!("Não foi possível criar a pasta do vault: {error}"))?;

    registry.vaults.push(vault.clone());
    if let Err(error) = write_vault_registry(&directory, &registry) {
        let _ = remove_vault_directory(&vault_directory);
        return Err(error);
    }

    Ok(VaultLibrary {
        vaults: registry.vaults,
        active_vault_id: registry.active_vault_id,
    })
}

pub(super) fn switch_vault(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    set_active_vault: &impl Fn(Option<(PathBuf, PathBuf)>, &str) -> Result<(), String>,
    vault_id: String,
) -> Result<VaultLibrary, String> {
    Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or_else(|| "VAULT_NOT_FOUND".to_string())?;
    let directories = active_vault_directories(&directory, vault)?;

    registry.active_vault_id = Some(vault_id);
    write_vault_registry(&directory, &registry)?;
    set_active_vault(Some(directories), "Não foi possível ativar o vault.")?;

    Ok(VaultLibrary {
        vaults: registry.vaults,
        active_vault_id: registry.active_vault_id,
    })
}

pub(super) fn rename_vault(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    vault_id: String,
    vault_name: String,
) -> Result<VaultLibrary, String> {
    Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let vault_name = vault_name.trim();
    if vault_name.is_empty() {
        return Err("EMPTY_VAULT_NAME".to_string());
    }
    if vault_name.chars().count() > 64 {
        return Err("VAULT_NAME_TOO_LONG".to_string());
    }

    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let vault_index = registry
        .vaults
        .iter()
        .position(|vault| vault.id == vault_id)
        .ok_or_else(|| "VAULT_NOT_FOUND".to_string())?;
    let normalized_name = normalize_name(vault_name);
    if registry
        .vaults
        .iter()
        .any(|vault| vault.id != vault_id && normalize_name(&vault.name) == normalized_name)
    {
        return Err("DUPLICATE_VAULT_NAME".to_string());
    }

    registry.vaults[vault_index].name = vault_name.to_string();
    write_vault_registry(&directory, &registry)?;

    Ok(VaultLibrary {
        vaults: registry.vaults,
        active_vault_id: registry.active_vault_id,
    })
}

pub(super) fn delete_vault(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    set_active_vault: &impl Fn(Option<(PathBuf, PathBuf)>, &str) -> Result<(), String>,
    vault_id: String,
) -> Result<VaultDeleteResult, String> {
    Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let vault_index = registry
        .vaults
        .iter()
        .position(|vault| vault.id == vault_id)
        .ok_or_else(|| "VAULT_NOT_FOUND".to_string())?;
    let vault = registry.vaults[vault_index].clone();
    let deletion_stage = stage_vault_deletion(&directory, &vault)?;

    registry.vaults.remove(vault_index);
    let was_active = registry.active_vault_id.as_deref() == Some(&vault_id);
    if was_active {
        registry.active_vault_id = None;
    }
    if let Err(error) = write_vault_registry(&directory, &registry) {
        if let Some(stage) = &deletion_stage {
            let _ = restore_vault_deletion(stage);
        }
        return Err(error);
    }

    if was_active {
        set_active_vault(None, "Não foi possível desativar o vault removido.")?;
    }

    let vault_cleanup_error = if let Some(stage) = deletion_stage {
        cleanup_vault_deletion(stage)
    } else {
        None
    };
    let backup_cleanup_error = remove_vault_backups_directory(&directory, &vault.id)
        .err()
        .map(|error| format!("Não foi possível apagar os arquivos temporários do Vault: {error}"));
    let cleanup_error = [vault_cleanup_error, backup_cleanup_error]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let cleanup_error = (!cleanup_error.is_empty()).then(|| cleanup_error.join(" "));

    Ok(VaultDeleteResult {
        library: VaultLibrary {
            vaults: registry.vaults,
            active_vault_id: registry.active_vault_id,
        },
        cleanup_error,
    })
}
