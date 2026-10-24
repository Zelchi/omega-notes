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
    let notes_directory = resolve_notes_directory()?;
    let media_id = Uuid::now_v7().to_string();
    repository::store_copy(&notes_directory, &media_id, media_type, extension, source)?;
    Ok(media_id)
}

pub(crate) fn media_file_path(
    notes_directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<PathBuf, String> {
    repository::media_path(notes_directory, media_id, media_type)
}

pub(crate) fn orphaned_media_candidates(
    notes_directory: &Path,
    media_type: &str,
    referenced: &std::collections::HashSet<String>,
) -> Result<std::collections::HashSet<String>, String> {
    let ids = repository::existing_media_ids(notes_directory, media_type)?;
    Ok(ids.difference(referenced).cloned().collect())
}

pub(crate) fn remove_orphaned_media_files(
    notes_directory: &Path,
    media_type: &str,
    candidates: &std::collections::HashSet<String>,
) -> Result<usize, String> {
    candidates.iter().try_fold(0, |removed, media_id| {
        repository::remove_media(notes_directory, media_id, media_type)
            .map(|count| removed + count)
    })
}

pub(crate) fn collect_unreferenced_media(
    notes_directory: &Path,
    media_type: &str,
    candidates: &std::collections::HashSet<String>,
    referenced: &std::collections::HashSet<String>,
) -> Result<(), String> {
    for media_id in candidates.difference(referenced) {
        repository::remove_media(notes_directory, media_id, media_type)?;
    }
    Ok(())
}
