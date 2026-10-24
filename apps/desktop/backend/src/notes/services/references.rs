use std::{collections::HashSet, fs, path::Path};

use serde_json::Value;
use uuid::Uuid;

use super::super::document::{audio_ids_in_document, image_ids_in_document, video_ids_in_document};
use super::super::models::NoteDocument;
use super::super::repository::{
    note_from_path, note_from_path_with_id, note_id_from_backup, note_paths,
};
use crate::notes::validate_note_id;

pub(crate) fn referenced_image_ids(
    notes_directory: &Path,
    backups_directory: &Path,
) -> Result<HashSet<String>, String> {
    referenced_media_ids(notes_directory, backups_directory).map(|(images, _, _)| images)
}

pub(crate) fn referenced_media_ids(
    notes_directory: &Path,
    backups_directory: &Path,
) -> Result<(HashSet<String>, HashSet<String>, HashSet<String>), String> {
    let mut images = HashSet::new();
    let mut audio = HashSet::new();
    let mut video = HashSet::new();
    visit_note_versions(notes_directory, backups_directory, |document| {
        images.extend(image_ids_in_document(document));
        audio.extend(audio_ids_in_document(document));
        video.extend(video_ids_in_document(document));
    })?;
    collect_recovery_ids(backups_directory, &mut images, &mut audio, &mut video)?;
    Ok((images, audio, video))
}

fn collect_recovery_ids(
    backups_directory: &Path,
    images: &mut HashSet<String>,
    audio: &mut HashSet<String>,
    video: &mut HashSet<String>,
) -> Result<(), String> {
    let directory = backups_directory.join("Recuperação");
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("A pasta de recuperação não é um diretório seguro.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Não foi possível verificar a recuperação: {error}")),
    }
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("Não foi possível ler a recuperação: {error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Não foi possível ler a recuperação: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("recovery") {
            continue;
        }
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Não foi possível verificar uma recuperação: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        let contents = fs::read(&path)
            .map_err(|error| format!("Não foi possível ler uma recuperação: {error}"))?;
        let value: Value = serde_json::from_slice(&contents)
            .map_err(|error| format!("Uma recuperação contém JSON inválido: {error}"))?;
        let elements = value
            .pointer("/document/elements")
            .and_then(Value::as_array)
            .ok_or_else(|| "Uma recuperação não contém os elementos da nota.".to_string())?;
        for element in elements {
            let (ids, field) = match element.get("type").and_then(Value::as_str) {
                Some("image") => (&mut *images, "imageId"),
                Some("audio") => (&mut *audio, "audioId"),
                Some("video") => (&mut *video, "videoId"),
                _ => continue,
            };
            let Some(id) = element.get(field).and_then(Value::as_str) else {
                continue;
            };
            if let Ok(uuid) = Uuid::parse_str(id) {
                ids.insert(uuid.to_string());
            }
        }
    }
    Ok(())
}

fn visit_note_versions(
    notes_directory: &Path,
    backups_directory: &Path,
    mut visit: impl FnMut(&NoteDocument),
) -> Result<(), String> {
    let (mut paths, entry_errors) = note_paths(notes_directory)
        .map_err(|error| format!("Não foi possível abrir a biblioteca: {error}"))?;
    if let Some(error) = entry_errors.first() {
        return Err(format!("Não foi possível ler a biblioteca: {error}"));
    }
    let (backup_paths, backup_entry_errors) = note_paths(backups_directory)
        .map_err(|error| format!("Não foi possível abrir os arquivos temporários: {error}"))?;
    if let Some(error) = backup_entry_errors.first() {
        return Err(format!(
            "Não foi possível ler os arquivos temporários: {error}"
        ));
    }
    paths.extend(backup_paths);

    let archive = super::super::deleted_notes_directory(notes_directory);
    if archive.exists() {
        let (deleted_paths, errors) = note_paths(&archive)
            .map_err(|error| format!("Não foi possível ler o histórico de exclusões: {error}"))?;
        if !errors.is_empty() {
            return Err(errors.join(" "));
        }
        paths.extend(deleted_paths);
    }

    for path in paths {
        let extension = path.extension().and_then(|value| value.to_str());
        let note = match extension {
            Some("omega") => note_from_path(&path)?,
            Some("temp") => {
                let Some(note_id) = note_id_from_backup(&path) else {
                    continue;
                };
                note_from_path_with_id(&path, note_id)?
            }
            _ => continue,
        };
        visit(&note.document);
    }

    visit_rename_journal(backups_directory, &mut visit)?;
    Ok(())
}

fn visit_rename_journal(
    backups_directory: &Path,
    visit: &mut impl FnMut(&NoteDocument),
) -> Result<(), String> {
    let directory = backups_directory.join(".rename-in-progress");
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("Journal de renomeação não é um diretório seguro.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Não foi possível verificar o journal: {error}")),
    }

    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("Não foi possível ler o journal de renomeação: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Não foi possível ler o journal: {error}"))?;
        let path = entry.path();
        if !matches!(
            path.extension().and_then(|value| value.to_str()),
            Some("note" | "backup")
        ) {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            format!("Não foi possível verificar um snapshot do journal: {error}")
        })?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("Snapshot inseguro no journal de renomeação.".into());
        }
        let note_id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Nome de snapshot inválido no journal.".to_string())?;
        validate_note_id(note_id)?;
        let note = note_from_path_with_id(&path, note_id)?;
        visit(&note.document);
    }
    Ok(())
}
