use tauri::AppHandle;

use crate::app::runtime;

use super::service;

#[tauri::command]
pub(crate) async fn import_note_image(
    app: AppHandle,
    source_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _asset_lock = crate::media::lock_asset_mutations()?;
        service::import_note_image(&|| runtime::notes_dir(&app), &source_path)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a imagem: {error}"))?
}

#[tauri::command]
pub(crate) async fn read_note_image(
    app: AppHandle,
    image_id: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        service::read_note_image(&|| runtime::notes_dir(&app), &image_id)
    })
    .await
    .map_err(|_| "IMAGE_READ_FAILED".to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub(crate) async fn import_clipboard_image(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Conteúdo de imagem inválido.".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _asset_lock = crate::media::lock_asset_mutations()?;
        let directory = runtime::notes_dir(&app)?;
        service::import_clipboard_image(&directory, &bytes)
    })
    .await
    .map_err(|error| format!("Não foi possível colar a imagem: {error}"))?
}
