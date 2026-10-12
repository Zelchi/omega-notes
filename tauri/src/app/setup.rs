use tauri::{AppHandle, Manager};

use crate::media;
use crate::stream::MediaStream;
use crate::vaults;

use super::runtime;

#[derive(Debug)]
pub(crate) struct SetupFailure(String);

impl std::fmt::Display for SetupFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for SetupFailure {}

pub(crate) fn initialize(app: AppHandle) -> Result<(), SetupFailure> {
    vaults::initialize_active_vault(&|| runtime::app_directory(&app), &|directory, message| {
        runtime::set_active_vault(&app, directory, message)
    })
    .map_err(SetupFailure)?;

    let stream_app = app.clone();
    let stream = MediaStream::start(move |media_id, media_type| {
        let directory = runtime::notes_dir(&stream_app)?;
        media::media_file_path(&directory, media_id, media_type)
    })
    .map_err(|error| {
        SetupFailure(format!(
            "Não foi possível iniciar o stream de mídia: {error}"
        ))
    })?;
    app.manage(stream);

    Ok(())
}
