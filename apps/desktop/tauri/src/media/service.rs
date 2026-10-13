use std::collections::HashSet;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::repository;

pub(super) fn import_note_media(
    resolve_notes_directory: &impl Fn() -> Result<PathBuf, String>,
    source_path: &str,
    media_type: &str,
) -> Result<String, String> {
    let source = Path::new(source_path);
    let extension = repository::extension_from_path(source, media_type)?;
    let directory = resolve_notes_directory()?;
    let media_id = Uuid::now_v7().to_string();
    repository::store_copy(&directory, &media_id, media_type, extension, source)?;
    Ok(media_id)
}

pub(crate) fn media_file_path(
    directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<std::path::PathBuf, String> {
    repository::media_path(directory, media_id, media_type)
}

pub(crate) fn collect_unreferenced_media(
    directory: &Path,
    audio_candidates: &HashSet<String>,
    video_candidates: &HashSet<String>,
    referenced_audio_ids: &HashSet<String>,
    referenced_video_ids: &HashSet<String>,
) -> Result<(), String> {
    for (media_type, candidates, referenced) in [
        ("audio", audio_candidates, referenced_audio_ids),
        ("video", video_candidates, referenced_video_ids),
    ] {
        for media_id in candidates.difference(referenced) {
            repository::remove_media(directory, media_id, media_type)?;
        }
    }
    Ok(())
}
