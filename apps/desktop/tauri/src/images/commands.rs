use tauri::AppHandle;

use crate::app::runtime;

use super::service;

#[tauri::command]
pub(crate) async fn import_note_image(
    app: AppHandle,
    source_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _asset_lock = service::lock_asset_mutations()?;
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
        let _asset_lock = service::lock_asset_mutations()?;
        let directory = runtime::notes_dir(&app)?;
        service::import_clipboard_image(&directory, &bytes)
    })
    .await
    .map_err(|error| format!("Não foi possível colar a imagem: {error}"))?
}

#[tauri::command]
pub(crate) async fn cleanup_orphaned_media(
    app: AppHandle,
) -> Result<crate::app::library::MediaCleanupSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _title_lock = crate::app::library::lock_title_mutations()?;
        let _asset_lock = service::lock_asset_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
        let summary = crate::app::library::cleanup_orphaned_media(&directories.0, &directories.1)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("O vault ativo mudou durante a limpeza de mídias.".to_string());
        }
        Ok(summary)
    })
    .await
    .map_err(|error| format!("Não foi possível limpar as imagens: {error}"))?
}
