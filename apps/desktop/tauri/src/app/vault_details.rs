use std::path::PathBuf;
use uuid::Uuid;

use crate::notes;
use crate::vaults::{
    existing_vault_notes_dir, read_vault_registry, vault_backups_directory, vault_directory,
    vault_storage_stats, VaultDetails,
};

pub(crate) fn get_vault_details(
    resolve_app_directory: &impl Fn() -> Result<PathBuf, String>,
    vault_id: String,
) -> Result<VaultDetails, String> {
    let uuid =
        Uuid::parse_str(&vault_id).map_err(|_| "Identificador de vault inválido.".to_string())?;
    let created_at = if uuid.get_version_num() == 7 {
        uuid.as_bytes()[..6]
            .iter()
            .fold(0_u64, |timestamp, byte| (timestamp << 8) | u64::from(*byte))
    } else {
        0
    };
    let directory = resolve_app_directory()?;
    let registry = read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or_else(|| "VAULT_NOT_FOUND".to_string())?;
    let Some(notes_directory) = existing_vault_notes_dir(&directory, vault)? else {
        return Ok(VaultDetails {
            note_count: 0,
            image_count: 0,
            audio_count: 0,
            video_count: 0,
            character_count: 0,
            created_at,
            storage_bytes: 0,
            last_modified_at: 0,
        });
    };

    let content = notes::content_stats(&notes_directory)?;

    let vault_directory = vault_directory(&directory, vault)?;
    let backups_directory = vault_backups_directory(&directory, &vault.id);
    let (vault_storage_bytes, vault_last_modified_at) = vault_storage_stats(&vault_directory)?;
    let (backup_storage_bytes, backup_last_modified_at) = if backups_directory.is_dir() {
        vault_storage_stats(&backups_directory)?
    } else {
        (0, 0)
    };

    Ok(VaultDetails {
        note_count: content.note_count,
        image_count: content.image_count,
        audio_count: content.audio_count,
        video_count: content.video_count,
        character_count: content.character_count,
        created_at,
        storage_bytes: vault_storage_bytes.saturating_add(backup_storage_bytes),
        last_modified_at: vault_last_modified_at.max(backup_last_modified_at),
    })
}
