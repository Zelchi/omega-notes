use std::sync::{LazyLock, Mutex};

use crate::app::runtime;
use crate::runtime::AppContext;

use super::{service, stream::MediaStream};

static MEDIA_STREAM: LazyLock<Mutex<Option<MediaStream>>> = LazyLock::new(|| Mutex::new(None));

pub(crate) async fn import_note_media(
    app: AppContext,
    source_path: String,
    media_type: String,
) -> Result<String, String> {
    crate::runtime::spawn_blocking(move || {
        let _asset_lock = crate::images::lock_asset_mutations()?;
        service::import_note_media(&|| runtime::notes_dir(&app), &source_path, &media_type)
    })
    .await
    .map_err(|error| format!("Não foi possível importar a mídia: {error}"))?
}

pub(crate) async fn note_media_stream_url(
    app: AppContext,
    media_id: String,
    media_type: String,
) -> Result<String, String> {
    crate::runtime::spawn_blocking(move || {
        let notes_directory = runtime::notes_dir(&app)?;
        let media_path = service::media_file_path(&notes_directory, &media_id, &media_type)?;
        let extension = media_path
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Extensão de mídia inválida.".to_string())?;

        let mut stream = MEDIA_STREAM
            .lock()
            .map_err(|_| "Não foi possível acessar o servidor de mídia.".to_string())?;
        if stream.is_none() {
            let stream_app = app.clone();
            *stream = Some(
                MediaStream::start(move |id, kind| {
                    let notes_directory = runtime::notes_dir(&stream_app)?;
                    service::media_file_path(&notes_directory, id, kind)
                })
                .map_err(|error| {
                    format!("Não foi possível iniciar o servidor de mídia: {error}")
                })?,
            );
        }
        Ok(stream.as_ref().expect("media stream initialized").url(
            &media_type,
            &media_id,
            extension,
        ))
    })
    .await
    .map_err(|error| format!("Não foi possível preparar a reprodução: {error}"))?
}

pub(crate) async fn music_stream_url(
    app: AppContext,
    source_url: String,
) -> Result<String, String> {
    let source = crate::web::parse_public_https_url(&source_url)?;
    crate::runtime::spawn_blocking(move || {
        let mut stream = MEDIA_STREAM
            .lock()
            .map_err(|_| "Não foi possível acessar o servidor de mídia.".to_string())?;
        if stream.is_none() {
            let stream_app = app.clone();
            *stream = Some(
                MediaStream::start(move |id, kind| {
                    let notes_directory = runtime::notes_dir(&stream_app)?;
                    service::media_file_path(&notes_directory, id, kind)
                })
                .map_err(|error| {
                    format!("Não foi possível iniciar o servidor de mídia: {error}")
                })?,
            );
        }
        stream
            .as_ref()
            .ok_or_else(|| "Não foi possível preparar a estação.".to_string())?
            .remote_url(source)
    })
    .await
    .map_err(|error| format!("Não foi possível preparar a estação: {error}"))?
}
