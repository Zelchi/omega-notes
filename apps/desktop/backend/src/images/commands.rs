use crate::runtime::{AppContext, Channel};
use base64::{engine::general_purpose::STANDARD, Engine};

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

pub(crate) async fn read_note_image(
    app: AppContext,
    image_id: String,
    on_chunk: Channel<String>,
) -> Result<usize, String> {
    let bytes = crate::runtime::spawn_blocking(move || {
        service::read_note_image(&|| runtime::notes_dir(&app), &image_id)
    })
    .await
    .map_err(|_| "IMAGE_READ_FAILED".to_string())??;
    for chunk in bytes.chunks(192 * 1024) {
        on_chunk.send(STANDARD.encode(chunk))?;
    }
    Ok(bytes.len())
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

pub(crate) async fn cleanup_orphaned_media(
    app: AppContext,
) -> Result<crate::app::library::MediaCleanupSummary, String> {
    crate::runtime::spawn_blocking(move || {
        let _title_lock = crate::app::library::lock_title_mutations()?;
        let _asset_lock = service::lock_asset_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
        let vault_lock = crate::app::library::title_lock_for_vault(&directories.0)?;
        let _vault_lock = crate::app::library::lock_vault_title_operations(&vault_lock)?;
        let summary = crate::app::library::cleanup_orphaned_media(&directories.0, &directories.1)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("O vault ativo mudou durante a limpeza de mídias.".to_string());
        }
        Ok(summary)
    })
    .await
    .map_err(|error| format!("Não foi possível limpar as mídias: {error}"))?
}
