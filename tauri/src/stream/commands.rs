use tauri::{AppHandle, Manager};

use crate::app::runtime;
use crate::media;

use super::server::MediaStream;
use super::service;

#[tauri::command]
pub(crate) fn note_media_stream_url(
    app: AppHandle,
    media_id: String,
    media_type: String,
) -> Result<String, String> {
    service::note_media_stream_url(
        &|id, kind| {
            let directory = runtime::notes_dir(&app)?;
            media::media_file_path(&directory, id, kind)
        },
        &|kind, id, extension| app.state::<MediaStream>().url(kind, id, extension),
        &media_id,
        &media_type,
    )
}
