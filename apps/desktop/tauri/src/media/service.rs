use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use uuid::Uuid;

use super::repository;

static ASSET_MUTATION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_asset_mutations() -> Result<MutexGuard<'static, ()>, String> {
    ASSET_MUTATION_LOCK
        .lock()
        .map_err(|_| "Não foi possível acessar os arquivos de mídia.".to_string())
}

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

pub(crate) fn orphaned_media_candidates(
    directory: &Path,
    media_type: &str,
    referenced_ids: &HashSet<String>,
) -> Result<HashSet<String>, String> {
    let ids = repository::existing_media_ids(directory, media_type)?;
    Ok(ids.difference(referenced_ids).cloned().collect())
}

pub(crate) fn remove_orphaned_media_files(
    directory: &Path,
    media_type: &str,
    candidates: &HashSet<String>,
) -> Result<usize, String> {
    candidates.iter().try_fold(0, |removed, media_id| {
        repository::remove_media(directory, media_id, media_type).map(|count| removed + count)
    })
}
