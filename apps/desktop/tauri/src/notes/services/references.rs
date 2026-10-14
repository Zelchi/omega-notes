use std::collections::HashSet;
use std::path::Path;

use super::super::document::{audio_ids_in_document, image_ids_in_document, video_ids_in_document};
use super::super::models::NoteDocument;
use super::super::repository::{
    note_from_path, note_from_path_with_id, note_id_from_backup, note_paths,
};

pub(crate) fn referenced_image_ids(
    notes_directory: &Path,
    backups_directory: &Path,
) -> Result<HashSet<String>, String> {
    collect_references(notes_directory, backups_directory, image_ids_in_document)
}

pub(crate) fn referenced_audio_and_video_ids(
    notes_directory: &Path,
    backups_directory: &Path,
) -> Result<(HashSet<String>, HashSet<String>), String> {
    let mut audio_ids = HashSet::new();
    let mut video_ids = HashSet::new();
    visit_note_versions(notes_directory, backups_directory, |document| {
        audio_ids.extend(audio_ids_in_document(document));
        video_ids.extend(video_ids_in_document(document));
    })?;
    Ok((audio_ids, video_ids))
}

fn collect_references(
    notes_directory: &Path,
    backups_directory: &Path,
    extract_ids: impl Fn(&NoteDocument) -> HashSet<String>,
) -> Result<HashSet<String>, String> {
    let mut referenced = HashSet::new();
    visit_note_versions(notes_directory, backups_directory, |document| {
        referenced.extend(extract_ids(document));
    })?;
    Ok(referenced)
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

    Ok(())
}
