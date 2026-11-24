use crate::runtime::AppContext;

use crate::app::runtime;

use super::service;

pub(crate) async fn import_note_image(
    app: AppContext,
    source_path: String,
) -> Result<String, String> {
    crate::runtime::spawn_blocking(move || {
        let _asset_lock = service::lock_asset_mutations()?;
        service::import_note_image(&|| runtime::notes_dir(&app), &source_path)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a imagem: {error}"))?
}

pub(crate) async fn resolve_note_image_path(
    app: AppContext,
    vault_id: String,
    image_id: String,
) -> Result<String, String> {
    crate::runtime::spawn_blocking(move || {
        let path = service::resolve_note_image_path(
            &|| runtime::notes_dir_for_vault(&app, &vault_id),
            &image_id,
        )?;
        path.to_str()
            .map(str::to_owned)
            .ok_or_else(|| "Caminho de imagem inválido.".to_string())
    })
    .await
    .map_err(|_| "IMAGE_READ_FAILED".to_string())?
}

pub(crate) async fn import_clipboard_image(
    app: AppContext,
    bytes: Vec<u8>,
) -> Result<String, String> {
    crate::runtime::spawn_blocking(move || {
        let _asset_lock = service::lock_asset_mutations()?;
        let directory = runtime::notes_dir(&app)?;
        service::import_clipboard_image(&directory, &bytes)
    })
    .await
    .map_err(|error| format!("Não foi possível colar a imagem: {error}"))?
}
