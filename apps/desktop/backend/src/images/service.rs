use std::collections::HashSet;
use std::fs;
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

fn safe_directory_exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(true),
        Ok(_) => Err("Uma pasta do vault não é segura.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Não foi possível verificar uma pasta do vault: {error}"
        )),
    }
}

fn remove_media_references_from_note_directory(
    directory: &Path,
    media_type: &str,
    media_id: &str,
) -> Result<Vec<crate::notes::StudyNote>, String> {
    let (paths, errors) = crate::notes::note_paths(directory)
        .map_err(|error| format!("Não foi possível ler as notas do vault: {error}"))?;
    if let Some(error) = errors.first() {
        return Err(format!("Não foi possível ler as notas do vault: {error}"));
    }

    let mut changed = Vec::new();
    for path in paths
        .into_iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("omega"))
    {
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Não foi possível verificar uma nota: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("Um arquivo de nota não é seguro.".into());
        }
        let note_id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or_else(|| "Nome de nota inválido.".to_string())?;
        if crate::notes::validate_note_id(note_id).is_err() {
            continue;
        }
        if let Some(note) = crate::notes::remove_media_reference_from_note_file(
            &path, note_id, media_type, media_id,
        )? {
            changed.push(note);
        }
    }
    Ok(changed)
}

fn remove_media_references_from_directory(
    notes_directory: &Path,
    backups_directory: &Path,
    media_type: &str,
    media_id: &str,
) -> Result<usize, String> {
    let changed =
        remove_media_references_from_note_directory(notes_directory, media_type, media_id)?;
    let archive_directory = crate::notes::deleted_notes_directory(notes_directory);
    if safe_directory_exists(&archive_directory)? {
        let _ =
            remove_media_references_from_note_directory(&archive_directory, media_type, media_id)?;
    }

    if safe_directory_exists(backups_directory)? {
        let (paths, errors) = crate::notes::note_paths(backups_directory)
            .map_err(|error| format!("Não foi possível ler os backups do vault: {error}"))?;
        if let Some(error) = errors.first() {
            return Err(format!("Não foi possível ler os backups do vault: {error}"));
        }
        for path in paths.into_iter().filter(|path| {
            path.extension().and_then(|extension| extension.to_str()) == Some("temp")
        }) {
            let Some(note_id) = crate::notes::note_id_from_backup(&path) else {
                continue;
            };
            if crate::notes::validate_note_id(note_id).is_err() {
                continue;
            }
            let _ = crate::notes::remove_media_reference_from_note_file(
                &path, note_id, media_type, media_id,
            )?;
        }
    }

    let changed_count = changed.len();
    crate::app::library::update_cached_note_summaries(notes_directory, &changed);
    Ok(changed_count)
}

pub(crate) fn delete_media_from_all_vaults(
    app_directory: &Path,
    media_type: &str,
    media_id: &str,
) -> Result<usize, String> {
    if !matches!(media_type, "image" | "audio" | "video") {
        return Err("Tipo de mídia inválido.".into());
    }
    let parsed =
        Uuid::parse_str(media_id).map_err(|_| "Identificador de mídia inválido.".to_string())?;
    if parsed.to_string() != media_id {
        return Err("Identificador de mídia inválido.".into());
    }

    let registry = crate::vaults::read_vault_registry(app_directory)?;
    let mut changed_notes = 0;
    for vault in &registry.vaults {
        let root = crate::vaults::vault_directory(app_directory, vault)?;
        if !safe_directory_exists(&root)? {
            continue;
        }
        let notes_directory = root.join("notes");
        let notes_exist = safe_directory_exists(&notes_directory)?;
        let backups_directory = crate::vaults::vault_backups_directory(app_directory, &vault.id);
        if notes_exist {
            let vault_lock = crate::app::library::title_lock_for_vault(&notes_directory)?;
            let _vault_lock = crate::app::library::lock_vault_title_operations(&vault_lock)?;
            changed_notes += remove_media_references_from_directory(
                &notes_directory,
                &backups_directory,
                media_type,
                media_id,
            )?;
            remove_media_asset(&notes_directory, media_type, media_id)?;
        } else {
            remove_media_asset(&notes_directory, media_type, media_id)?;
        }
    }
    Ok(changed_notes)
}

fn remove_media_asset(
    notes_directory: &Path,
    media_type: &str,
    media_id: &str,
) -> Result<usize, String> {
    match media_type {
        "image" => repository::remove_image(notes_directory, media_id),
        "audio" | "video" => {
            crate::media::remove_media_asset(notes_directory, media_id, media_type)
        }
        _ => Err("Tipo de mídia inválido.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::{delete_media_from_all_vaults, resolve_note_image_path};
    use std::fs;
    use tempfile::tempdir;
    use uuid::Uuid;

    fn add_image_note(
        notes: &std::path::Path,
        image_id: &str,
        extra_image_id: Option<&str>,
    ) -> String {
        let note_id = Uuid::now_v7().to_string();
        let mut document = crate::notes::empty_document();
        for id in std::iter::once(image_id).chain(extra_image_id) {
            document.elements.push(crate::notes::NoteElement::Image {
                id: Uuid::now_v7().to_string(),
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 90.0,
                image_id: id.to_string(),
            });
        }
        let backups = notes
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(".temp")
            .join(notes.parent().unwrap().file_name().unwrap());
        crate::notes::write_note(notes, &backups, &note_id, "Image note", &document).unwrap();
        note_id
    }

    fn add_audio_video_note(
        notes: &std::path::Path,
        audio_ids: &[&str],
        video_ids: &[&str],
    ) -> String {
        let note_id = Uuid::now_v7().to_string();
        let mut document = crate::notes::empty_document();
        for audio_id in audio_ids {
            document.elements.push(crate::notes::NoteElement::Audio {
                id: Uuid::now_v7().to_string(),
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 90.0,
                audio_id: (*audio_id).to_string(),
                extension: "mp3".to_string(),
                volume: 1.0,
            });
        }
        for video_id in video_ids {
            document.elements.push(crate::notes::NoteElement::Video {
                id: Uuid::now_v7().to_string(),
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 90.0,
                video_id: (*video_id).to_string(),
                extension: "mp4".to_string(),
            });
        }
        let app_directory = notes.parent().unwrap().parent().unwrap().parent().unwrap();
        let vault_id = notes.parent().unwrap().file_name().unwrap();
        let backups = app_directory.join(".temp").join(vault_id);
        crate::notes::write_note(notes, &backups, &note_id, "Media note", &document).unwrap();
        note_id
    }

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

    #[test]
    fn deletes_an_image_reference_and_asset_across_all_registered_vaults() {
        let temporary = tempdir().unwrap();
        let app_directory = temporary.path();
        let first_vault = Uuid::now_v7().to_string();
        let second_vault = Uuid::now_v7().to_string();
        fs::write(
            app_directory.join("vaults.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "activeVaultId": first_vault.clone(),
                "vaults": [
                    { "id": first_vault.clone(), "name": "First" },
                    { "id": second_vault.clone(), "name": "Second" }
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        let image_id = Uuid::now_v7().to_string();
        let keep_image_id = Uuid::now_v7().to_string();
        let mut affected_notes = Vec::new();
        for vault_id in [&first_vault, &second_vault] {
            let root = app_directory.join("vaults").join(vault_id);
            let notes = root.join("notes");
            let images = root.join("images");
            fs::create_dir_all(&notes).unwrap();
            fs::create_dir_all(&images).unwrap();
            fs::write(images.join(format!("{image_id}.png")), b"image").unwrap();
            let note_id = add_image_note(
                &notes,
                &image_id,
                (*vault_id == first_vault).then_some(keep_image_id.as_str()),
            );
            if *vault_id == first_vault {
                let backups = app_directory.join(".temp").join(vault_id);
                let archive = crate::notes::deleted_notes_directory(&notes);
                fs::create_dir_all(&archive).unwrap();
                fs::copy(
                    notes.join(format!("{note_id}.omega")),
                    archive.join(format!("{note_id}.omega")),
                )
                .unwrap();
                fs::copy(
                    notes.join(format!("{note_id}.omega")),
                    crate::notes::note_backup_path(&backups, &note_id),
                )
                .unwrap();
                fs::write(images.join(format!("{keep_image_id}.png")), b"keep").unwrap();
            }
            affected_notes.push((notes, note_id));
        }

        assert_eq!(
            delete_media_from_all_vaults(app_directory, "image", &image_id).unwrap(),
            2
        );

        for (notes, note_id) in affected_notes {
            let note =
                crate::notes::note_from_path(&notes.join(format!("{note_id}.omega"))).unwrap();
            assert!(!crate::notes::image_ids_in_document(&note.document).contains(&image_id));
            if notes.parent().unwrap().file_name().unwrap().to_str() == Some(first_vault.as_str()) {
                assert!(
                    crate::notes::image_ids_in_document(&note.document).contains(&keep_image_id)
                );
                let backups = app_directory.join(".temp").join(&first_vault);
                let backup = crate::notes::note_from_path_with_id(
                    &crate::notes::note_backup_path(&backups, &note_id),
                    &note_id,
                )
                .unwrap();
                assert!(!crate::notes::image_ids_in_document(&backup.document).contains(&image_id));
                let archived = crate::notes::note_from_path_with_id(
                    &crate::notes::deleted_notes_directory(&notes).join(format!("{note_id}.omega")),
                    &note_id,
                )
                .unwrap();
                assert!(
                    !crate::notes::image_ids_in_document(&archived.document).contains(&image_id)
                );
            }
        }
        for vault_id in [&first_vault, &second_vault] {
            assert!(!app_directory
                .join("vaults")
                .join(vault_id)
                .join("images")
                .join(format!("{image_id}.png"))
                .exists());
        }
        assert!(app_directory
            .join("vaults")
            .join(&first_vault)
            .join("images")
            .join(format!("{keep_image_id}.png"))
            .exists());
    }

    #[test]
    fn deletes_audio_and_video_references_and_assets_across_registered_vaults() {
        let temporary = tempdir().unwrap();
        let app_directory = temporary.path();
        let first_vault = Uuid::now_v7().to_string();
        let second_vault = Uuid::now_v7().to_string();
        fs::write(
            app_directory.join("vaults.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "activeVaultId": first_vault.clone(),
                "vaults": [
                    { "id": first_vault.clone(), "name": "First" },
                    { "id": second_vault.clone(), "name": "Second" }
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        let target_audio = Uuid::now_v7().to_string();
        let target_video = target_audio.clone();
        let keep_audio = Uuid::now_v7().to_string();
        let keep_video = Uuid::now_v7().to_string();
        let mut affected_notes = Vec::new();
        for vault_id in [&first_vault, &second_vault] {
            let root = app_directory.join("vaults").join(vault_id);
            let notes = root.join("notes");
            let audios = root.join("audios");
            let videos = root.join("videos");
            fs::create_dir_all(&notes).unwrap();
            fs::create_dir_all(&audios).unwrap();
            fs::create_dir_all(&videos).unwrap();
            fs::write(audios.join(format!("{target_audio}.mp3")), b"audio").unwrap();
            fs::write(videos.join(format!("{target_video}.mp4")), b"video").unwrap();
            let first = *vault_id == first_vault;
            let audio_ids = if first {
                vec![target_audio.as_str(), keep_audio.as_str()]
            } else {
                vec![target_audio.as_str()]
            };
            let video_ids = if first {
                vec![target_video.as_str(), keep_video.as_str()]
            } else {
                vec![target_video.as_str()]
            };
            let note_id = add_audio_video_note(&notes, &audio_ids, &video_ids);
            if first {
                fs::write(audios.join(format!("{keep_audio}.mp3")), b"keep audio").unwrap();
                fs::write(videos.join(format!("{keep_video}.mp4")), b"keep video").unwrap();
                let archive = crate::notes::deleted_notes_directory(&notes);
                fs::create_dir_all(&archive).unwrap();
                fs::copy(
                    notes.join(format!("{note_id}.omega")),
                    archive.join(format!("{note_id}.omega")),
                )
                .unwrap();
                fs::copy(
                    notes.join(format!("{note_id}.omega")),
                    crate::notes::note_backup_path(
                        &app_directory.join(".temp").join(vault_id),
                        &note_id,
                    ),
                )
                .unwrap();
            }
            affected_notes.push((notes, note_id));
        }

        assert_eq!(
            delete_media_from_all_vaults(app_directory, "audio", &target_audio).unwrap(),
            2
        );
        for (notes, note_id) in &affected_notes {
            let note =
                crate::notes::note_from_path(&notes.join(format!("{note_id}.omega"))).unwrap();
            assert!(!crate::notes::audio_ids_in_document(&note.document).contains(&target_audio));
            assert!(crate::notes::video_ids_in_document(&note.document).contains(&target_video));
        }
        for vault_id in [&first_vault, &second_vault] {
            let root = app_directory.join("vaults").join(vault_id);
            assert!(!root
                .join("audios")
                .join(format!("{target_audio}.mp3"))
                .exists());
            assert!(root
                .join("videos")
                .join(format!("{target_video}.mp4"))
                .exists());
        }

        assert_eq!(
            delete_media_from_all_vaults(app_directory, "video", &target_video).unwrap(),
            2
        );
        for (notes, note_id) in &affected_notes {
            let note =
                crate::notes::note_from_path(&notes.join(format!("{note_id}.omega"))).unwrap();
            assert!(!crate::notes::video_ids_in_document(&note.document).contains(&target_video));
            if notes.parent().unwrap().file_name().unwrap().to_str() == Some(first_vault.as_str()) {
                assert!(crate::notes::audio_ids_in_document(&note.document).contains(&keep_audio));
                assert!(crate::notes::video_ids_in_document(&note.document).contains(&keep_video));
                for path in [
                    crate::notes::note_backup_path(
                        &app_directory.join(".temp").join(&first_vault),
                        note_id,
                    ),
                    crate::notes::deleted_notes_directory(notes).join(format!("{note_id}.omega")),
                ] {
                    let archived = crate::notes::note_from_path_with_id(&path, note_id).unwrap();
                    assert!(!crate::notes::audio_ids_in_document(&archived.document)
                        .contains(&target_audio));
                    assert!(!crate::notes::video_ids_in_document(&archived.document)
                        .contains(&target_video));
                }
            }
        }
        for vault_id in [&first_vault, &second_vault] {
            let root = app_directory.join("vaults").join(vault_id);
            assert!(!root
                .join("videos")
                .join(format!("{target_video}.mp4"))
                .exists());
        }
        let first_root = app_directory.join("vaults").join(&first_vault);
        assert!(first_root
            .join("audios")
            .join(format!("{keep_audio}.mp3"))
            .exists());
        assert!(first_root
            .join("videos")
            .join(format!("{keep_video}.mp4"))
            .exists());
    }
}
