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
        service::import_note_media(&|| runtime::notes_dir(&app), &source_path, &media_type)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a mídia: {error}"))?
}
