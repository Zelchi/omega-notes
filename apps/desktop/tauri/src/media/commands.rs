use tauri::AppHandle;

use crate::app::runtime;

use super::service;

#[tauri::command]
pub(crate) async fn import_note_media(
    app: AppHandle,
    source_path: String,
    media_type: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _asset_lock = super::lock_asset_mutations()?;
        service::import_note_media(&|| runtime::notes_dir(&app), &source_path, &media_type)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a mídia: {error}"))?
}

#[tauri::command]
pub(crate) async fn cleanup_orphaned_media(
    app: AppHandle,
) -> Result<crate::app::library::MediaCleanupSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _title_lock = crate::app::library::lock_title_mutations()?;
        let _asset_lock = super::lock_asset_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
        let summary = crate::app::library::cleanup_orphaned_media(&directories.0, &directories.1)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("O vault ativo mudou durante a limpeza de mídias.".to_string());
        }
        Ok(summary)
    })
    .await
    .map_err(|error| format!("Não foi possível limpar as mídias: {error}"))?
}
