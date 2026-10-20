use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::storage::{atomic_write, preserve_recovery_copy as preserve_file_copy};

use super::document::{preview_from_document, validate_document};
use super::models::{NoteDocument, OmegaNoteFile, StudyNote};
use super::validation::{validate_note_id, validate_note_title};

fn modified_at(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn note_from_path(path: &Path) -> Result<StudyNote, String> {
    let id = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| "Nome de arquivo de nota inválido.".to_string())?
        .to_string();
    note_from_path_with_id(path, &id)
}

pub(crate) fn note_from_path_with_id(path: &Path, id: &str) -> Result<StudyNote, String> {
    let stored = fs::read_to_string(path)
        .map_err(|error| format!("Não foi possível ler a nota: {error}"))?;
    note_from_contents(path, id, &stored)
}

pub(crate) fn note_from_contents(path: &Path, id: &str, stored: &str) -> Result<StudyNote, String> {
    let note: OmegaNoteFile = serde_json::from_str(stored)
        .map_err(|error| format!("Não foi possível interpretar a nota: {error}"))?;
    if note.format != "omega-page" || note.version != 2 {
        return Err("Formato de nota Ômega Notes incompatível.".to_string());
    }
    if note.id != id {
        return Err("O identificador da nota não corresponde ao arquivo.".to_string());
    }
    validate_document(&note.document)?;

    Ok(StudyNote {
        preview: preview_from_document(&note.document),
        document: note.document,
        updated_at: modified_at(path),
        id: id.to_string(),
        title: note.title,
    })
}

pub(crate) fn note_backup_path(backups_directory: &Path, note_id: &str) -> PathBuf {
    backups_directory.join(format!(".{note_id}.omega.temp"))
}

pub(crate) fn note_path(directory: &Path, note_id: &str) -> PathBuf {
    directory.join(format!("{note_id}.omega"))
}

pub(crate) fn note_paths(directory: &Path) -> Result<(Vec<PathBuf>, Vec<String>), std::io::Error> {
    let entries = fs::read_dir(directory)?;
    let mut paths = Vec::new();
    let mut errors = Vec::new();
    for entry in entries {
        match entry {
            Ok(entry) => paths.push(entry.path()),
            Err(error) => errors.push(error.to_string()),
        }
    }
    Ok((paths, errors))
}

pub(crate) fn note_file_exists(directory: &Path, note_id: &str) -> bool {
    note_path(directory, note_id).exists()
}

pub(crate) fn note_backup_exists(backups_directory: &Path, note_id: &str) -> bool {
    note_backup_path(backups_directory, note_id).is_file()
}

pub(crate) fn read_file_bytes(path: &Path) -> Result<Vec<u8>, std::io::Error> {
    fs::read(path)
}

pub(crate) fn restore_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    atomic_write(path, contents, None)
}

pub(crate) fn preserve_recovery_copy(path: &Path, directory: &Path) -> Result<PathBuf, String> {
    preserve_file_copy(path, directory)
}

pub(crate) fn note_id_from_backup(path: &Path) -> Option<&str> {
    path.file_name()?
        .to_str()?
        .strip_prefix('.')?
        .strip_suffix(".omega.temp")
}

pub(crate) fn write_note(
    directory: &Path,
    backups_directory: &Path,
    note_id: &str,
    title: &str,
    document: &NoteDocument,
) -> Result<StudyNote, String> {
    write_note_checked(directory, backups_directory, note_id, title, document, None)
}

pub(crate) fn write_note_checked(
    directory: &Path,
    backups_directory: &Path,
    note_id: &str,
    title: &str,
    document: &NoteDocument,
    expected: Option<&[u8]>,
) -> Result<StudyNote, String> {
    validate_note_id(note_id)?;
    validate_note_title(title)?;
    validate_document(document)?;
    let path = note_path(directory, note_id);
    let note = OmegaNoteFile {
        format: "omega-page".to_string(),
        version: 2,
        id: note_id.to_string(),
        title: title.to_string(),
        document: document.clone(),
    };
    let serialized = serde_json::to_vec_pretty(&note)
        .map_err(|error| format!("Não foi possível preparar a nota: {error}"))?;
    fs::create_dir_all(backups_directory).map_err(|error| {
        format!("Não foi possível acessar os arquivos temporários do Vault: {error}")
    })?;
    let backup = note_backup_path(backups_directory, note_id);
    crate::storage::atomic_write_checked(&path, &serialized, Some(&backup), expected)?;
    let stored = std::str::from_utf8(&serialized).map_err(|_| "NOTE_SAVE_FAILED")?;
    note_from_contents(&path, note_id, stored)
}

pub(crate) fn existing_note(directory: &Path, note_id: &str) -> Result<Option<StudyNote>, String> {
    let path = note_path(directory, note_id);
    if path.is_file() {
        return note_from_path(&path).map(Some);
    }
    Ok(None)
}

pub(crate) struct FileSnapshot {
    path: PathBuf,
    contents: Option<Vec<u8>>,
}

pub(crate) fn snapshot_note_files(
    directory: &Path,
    backups_directory: &Path,
    note_ids: &[String],
) -> Result<Vec<FileSnapshot>, String> {
    let mut snapshots = Vec::new();
    for note_id in note_ids {
        for path in [
            directory.join(format!("{note_id}.omega")),
            note_backup_path(backups_directory, note_id),
        ] {
            let contents = match fs::read(&path) {
                Ok(contents) => Some(contents),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => {
                    return Err(format!("Não foi possível preparar a renomeação: {error}"))
                }
            };
            snapshots.push(FileSnapshot { path, contents });
        }
    }
    Ok(snapshots)
}

pub(crate) fn restore_note_files(snapshots: &[FileSnapshot]) -> Result<(), String> {
    let mut errors = Vec::new();
    for snapshot in snapshots.iter().rev() {
        let result = match &snapshot.contents {
            Some(contents) => atomic_write(&snapshot.path, contents, None),
            None => match fs::remove_file(&snapshot.path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("Não foi possível remover arquivo criado: {error}")),
            },
        };
        if let Err(error) = result {
            errors.push(error);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" "))
    }
}

pub(crate) fn delete_note_files(
    directory: &Path,
    backups_directory: &Path,
    note_id: &str,
) -> Result<(), String> {
    for path in [
        note_backup_path(backups_directory, note_id),
        note_path(directory, note_id),
    ] {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível apagar a nota: {error}")),
        }
    }
    Ok(())
}
