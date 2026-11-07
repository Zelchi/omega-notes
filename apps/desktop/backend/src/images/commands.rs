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
