use std::collections::HashSet;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::repository;

pub(super) fn import_note_image(
    resolve_notes_directory: &impl Fn() -> Result<PathBuf, String>,
    source_path: &str,
) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    let extension = repository::extension_from_path(&source)?;
    let directory = resolve_notes_directory()?;
    let image_id = Uuid::now_v7().to_string();
    repository::store_copy(&directory, &image_id, extension, &source)?;
    Ok(image_id)
}

pub(super) fn import_clipboard_image(directory: &Path, bytes: &[u8]) -> Result<String, String> {
    let image_id = Uuid::now_v7().to_string();
    repository::store_bytes(directory, &image_id, bytes)?;
    Ok(image_id)
}

pub(super) fn read_note_image(
    resolve_notes_directory: &impl Fn() -> Result<PathBuf, String>,
    image_id: &str,
) -> Result<Vec<u8>, String> {
    Uuid::parse_str(image_id).map_err(|_| "Identificador de imagem inválido.".to_string())?;
    repository::read_image(&resolve_notes_directory()?, image_id)
}

pub(crate) fn collect_unreferenced_images(
    directory: &Path,
    candidates: &HashSet<String>,
    referenced: &HashSet<String>,
) -> Result<(), String> {
    for image_id in candidates.difference(referenced) {
        repository::remove_image(directory, image_id)?;
    }
    Ok(())
}

pub(crate) fn orphaned_image_candidates(
    directory: &Path,
    referenced: &HashSet<String>,
) -> Result<HashSet<String>, String> {
    let image_ids = repository::existing_image_ids(directory)?;
    Ok(image_ids.difference(referenced).cloned().collect())
}

pub(crate) fn remove_orphaned_image_files(
    directory: &Path,
    candidates: &HashSet<String>,
) -> Result<usize, String> {
    candidates.iter().try_fold(0, |removed, image_id| {
        repository::remove_image(directory, image_id).map(|count| removed + count)
    })
}
