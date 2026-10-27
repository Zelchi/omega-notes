use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use uuid::Uuid;

use crate::names::normalize_name;

use super::models::{Vault, VaultDeleteResult, VaultLibrary};
use super::repository::{
    cleanup_vault_deletion, ensure_vault_directories, read_vault_registry, recover_vault_deletions,
    remove_vault_backups_directory, remove_vault_directory, restore_vault_deletion,
    stage_vault_deletion, vault_backups_directory, vault_directory, vault_notes_dir,
    write_vault_registry,
};

static VAULT_REGISTRY_MUTATION_LOCK: Mutex<()> = Mutex::new(());

fn lock_vault_registry_mutations() -> Result<MutexGuard<'static, ()>, String> {
    VAULT_REGISTRY_MUTATION_LOCK
        .lock()
        .map_err(|_| "Não foi possível atualizar a lista de vaults.".to_string())
}

fn active_vault_directories(
    directory: &Path,
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
    recover_vault_deletions(&directory, &registry)?;
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
    let _registry_lock = lock_vault_registry_mutations()?;
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

pub(super) fn reorder_vaults(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    vault_ids: Vec<String>,
) -> Result<VaultLibrary, String> {
    let _registry_lock = lock_vault_registry_mutations()?;
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    let requested: std::collections::HashSet<_> = vault_ids.iter().collect();
    if vault_ids.len() != registry.vaults.len()
        || requested.len() != vault_ids.len()
        || !registry
            .vaults
            .iter()
            .all(|vault| requested.contains(&vault.id))
    {
        return Err("INVALID_VAULT_ORDER".to_string());
    }
    let mut by_id: std::collections::HashMap<_, _> = registry
        .vaults
        .into_iter()
        .map(|vault| (vault.id.clone(), vault))
        .collect();
    registry.vaults = vault_ids
        .into_iter()
        .map(|id| {
            by_id
                .remove(&id)
                .ok_or_else(|| "INVALID_VAULT_ORDER".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    write_vault_registry(&directory, &registry)?;
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
    let _title_mutations = crate::app::library::lock_title_mutations()?;
    let _registry_lock = lock_vault_registry_mutations()?;
    Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    recover_vault_deletions(&directory, &registry)?;
    let previous_registry = registry.clone();
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or_else(|| "VAULT_NOT_FOUND".to_string())?;
    let directories = active_vault_directories(&directory, vault)?;

    registry.active_vault_id = Some(vault_id);
    write_vault_registry(&directory, &registry)?;
    if let Err(error) = set_active_vault(Some(directories), "Não foi possível ativar o vault.") {
        return match write_vault_registry(&directory, &previous_registry) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error} Não foi possível restaurar o registro anterior dos vaults: {rollback_error}"
            )),
        };
    }

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
    let _registry_lock = lock_vault_registry_mutations()?;
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
    let _registry_lock = lock_vault_registry_mutations()?;
    Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let directory = resolve_app_directory()?;
    let mut registry = read_vault_registry(&directory)?;
    recover_vault_deletions(&directory, &registry)?;
    let previous_registry = registry.clone();
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
        let restore_error = deletion_stage
            .as_ref()
            .and_then(|stage| restore_vault_deletion(stage).err())
            .map(|restore_error| {
                format!(" Não foi possível restaurar a pasta original do vault: {restore_error}")
            })
            .unwrap_or_default();
        return Err(format!("{error}{restore_error}"));
    }

    if was_active {
        if let Err(error) = set_active_vault(None, "Não foi possível desativar o vault removido.")
        {
            let registry_error = write_vault_registry(&directory, &previous_registry).err();
            let restore_error = deletion_stage
                .as_ref()
                .and_then(|stage| restore_vault_deletion(stage).err());
            let mut rollback_errors = Vec::new();
            if let Some(registry_error) = registry_error {
                rollback_errors.push(format!(
                    "Não foi possível restaurar o registro dos vaults: {registry_error}"
                ));
            }
            if let Some(restore_error) = restore_error {
                rollback_errors.push(format!(
                    "Não foi possível restaurar a pasta original do vault: {restore_error}"
                ));
            }
            return if rollback_errors.is_empty() {
                Err(error)
            } else {
                Err(format!("{error} {}", rollback_errors.join(" ")))
            };
        }
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
