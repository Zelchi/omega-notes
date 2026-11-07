use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use uuid::Uuid;

use super::repository;

static ASSET_MUTATION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_asset_mutations() -> Result<MutexGuard<'static, ()>, String> {
    ASSET_MUTATION_LOCK
        .lock()
        .map_err(|_| "Não foi possível acessar os arquivos de imagem.".to_string())
}

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

pub(super) fn resolve_note_image_path(
    resolve_notes_directory: &impl Fn() -> Result<PathBuf, String>,
    image_id: &str,
) -> Result<PathBuf, String> {
    let parsed =
        Uuid::parse_str(image_id).map_err(|_| "Identificador de imagem inválido.".to_string())?;
    if parsed.to_string() != image_id {
        return Err("Identificador de imagem inválido.".to_string());
    }
    repository::resolve_image_path(&resolve_notes_directory()?, image_id)
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

#[cfg(test)]
mod tests {
    use super::resolve_note_image_path;
    use std::fs;
    use tempfile::tempdir;
    use uuid::Uuid;

    #[test]
    fn resolves_only_an_existing_image_with_a_canonical_uuid() {
        let temporary = tempdir().unwrap();
        let notes = temporary.path().join("vault/notes");
        let images = temporary.path().join("vault/images");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&images).unwrap();
        let image_id = Uuid::now_v7().to_string();
        let image_path = images.join(format!("{image_id}.png"));
        fs::write(&image_path, b"image").unwrap();

        let resolved = resolve_note_image_path(&|| Ok(notes.clone()), &image_id).unwrap();

        assert_eq!(resolved, image_path);
        assert_eq!(
            resolve_note_image_path(&|| Ok(notes.clone()), "../../outside"),
            Err("Identificador de imagem inválido.".to_string())
        );
        assert_eq!(
            resolve_note_image_path(&|| Ok(notes.clone()), &Uuid::now_v7().to_string()),
            Err("Imagem não encontrada.".to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn does_not_resolve_symlinked_image_files() {
        use std::os::unix::fs::symlink;

        let temporary = tempdir().unwrap();
        let notes = temporary.path().join("vault/notes");
        let images = temporary.path().join("vault/images");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&images).unwrap();
        let image_id = Uuid::now_v7().to_string();
        let outside = temporary.path().join("outside.png");
        fs::write(&outside, b"outside").unwrap();
        symlink(&outside, images.join(format!("{image_id}.png"))).unwrap();

        assert_eq!(
            resolve_note_image_path(&|| Ok(notes.clone()), &image_id),
            Err("Imagem não encontrada.".to_string())
        );
    }
}
