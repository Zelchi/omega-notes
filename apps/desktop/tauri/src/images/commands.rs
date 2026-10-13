use tauri::AppHandle;

use crate::app::runtime;

use super::service;

#[tauri::command]
pub(crate) async fn import_note_image(
    app: AppHandle,
    source_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        service::import_note_image(&|| runtime::notes_dir(&app), &source_path)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a imagem: {error}"))?
}

#[tauri::command]
pub(crate) fn read_note_image(
    app: AppHandle,
    image_id: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = service::read_note_image(&|| runtime::notes_dir(&app), &image_id)?;
    Ok(tauri::ipc::Response::new(bytes))
}
