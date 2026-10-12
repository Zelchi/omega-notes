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
