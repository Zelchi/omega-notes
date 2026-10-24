use std::fs;
use std::path::{Path, PathBuf};

use super::{note_from_path, note_path, note_paths, validate_note_id, NoteDocument, StudyNote};
use crate::storage::atomic_copy;

pub(crate) fn deleted_notes_directory(directory: &Path) -> PathBuf {
    directory.join(".undo")
}

pub(crate) fn archive_deleted_note(directory: &Path, note_id: &str) -> Result<(), String> {
    validate_note_id(note_id)?;
    let archive = deleted_notes_directory(directory);
    fs::create_dir_all(&archive)
        .map_err(|error| format!("Não foi possível preservar a nota para desfazer: {error}"))?;
    atomic_copy(
        &note_path(directory, note_id),
        &note_path(&archive, note_id),
    )
}

pub(crate) fn deleted_notes(directory: &Path) -> Result<Vec<StudyNote>, String> {
    let archive = deleted_notes_directory(directory);
    if !archive.exists() {
        return Ok(Vec::new());
    }
    let (paths, errors) = note_paths(&archive)
        .map_err(|error| format!("Não foi possível ler as notas apagadas: {error}"))?;
    if !errors.is_empty() {
        return Err(errors.join(" "));
    }
    let mut notes = Vec::new();
    for path in paths {
        if path.extension().and_then(|value| value.to_str()) != Some("omega") {
            continue;
        }
        let note = note_from_path(&path)?;
        validate_note_id(&note.id)?;
        let deleted_at = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .map_err(|error| format!("Não foi possível ler a data de exclusão: {error}"))?;
        notes.push((deleted_at, note));
    }
    notes.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.id.cmp(&a.1.id)));
    Ok(notes.into_iter().map(|(_, note)| note).collect())
}

pub(crate) fn prune_deleted_notes(directory: &Path) -> Result<Vec<NoteDocument>, String> {
    let mut removed = Vec::new();
    for note in deleted_notes(directory)?.into_iter().skip(100) {
        fs::remove_file(note_path(&deleted_notes_directory(directory), &note.id)).map_err(
            |error| format!("Não foi possível limitar o histórico de exclusões: {error}"),
        )?;
        removed.push(note.document);
    }
    Ok(removed)
}

pub(crate) fn remove_deleted_note(directory: &Path, note_id: &str) -> Result<(), String> {
    validate_note_id(note_id)?;
    match fs::remove_file(note_path(&deleted_notes_directory(directory), note_id)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível remover a cópia de desfazer: {error}"
        )),
    }
}
