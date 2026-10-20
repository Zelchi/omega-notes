use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

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

struct FileSnapshot {
    path: PathBuf,
    contents: Option<Vec<u8>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameJournalManifest {
    version: u8,
    notes: Vec<RenameJournalEntry>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameJournalEntry {
    id: String,
    note_exists: bool,
    backup_exists: bool,
}

pub(crate) struct NoteRenameJournal {
    directory: PathBuf,
    snapshots: Vec<FileSnapshot>,
}

const RENAME_JOURNAL_DIRECTORY: &str = ".rename-in-progress";
const MAX_RENAME_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

fn snapshot_note_files(
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
            let contents = match fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                    Some(fs::read(&path).map_err(|error| {
                        format!("Não foi possível preparar a renomeação: {error}")
                    })?)
                }
                Ok(_) => return Err("Arquivo inseguro na preparação da renomeação.".into()),
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

fn restore_note_files(snapshots: &[FileSnapshot]) -> Result<(), String> {
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

pub(crate) fn begin_note_rename_journal(
    directory: &Path,
    backups_directory: &Path,
    note_ids: &[String],
) -> Result<NoteRenameJournal, String> {
    recover_note_rename_journal(directory, backups_directory)?;
    fs::create_dir_all(backups_directory)
        .map_err(|error| format!("Não foi possível preparar a renomeação: {error}"))?;
    let snapshots = snapshot_note_files(directory, backups_directory, note_ids)?;
    let journal_directory = backups_directory.join(RENAME_JOURNAL_DIRECTORY);
    fs::create_dir(&journal_directory)
        .map_err(|error| format!("Não foi possível preparar a renomeação: {error}"))?;

    let result = (|| -> Result<(), String> {
        let mut entries = Vec::with_capacity(note_ids.len());
        for (note_id, pair) in note_ids.iter().zip(snapshots.chunks_exact(2)) {
            validate_note_id(note_id)?;
            let note_exists = pair[0].contents.is_some();
            let backup_exists = pair[1].contents.is_some();
            for (snapshot, suffix) in pair.iter().zip(["note", "backup"]) {
                if let Some(contents) = &snapshot.contents {
                    let path = journal_directory.join(format!("{note_id}.{suffix}"));
                    let mut file = OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&path)
                        .map_err(|error| {
                            format!("Não foi possível salvar a cópia da renomeação: {error}")
                        })?;
                    file.write_all(contents).map_err(|error| {
                        format!("Não foi possível salvar a cópia da renomeação: {error}")
                    })?;
                    file.sync_all().map_err(|error| {
                        format!("Não foi possível salvar a cópia da renomeação: {error}")
                    })?;
                }
            }
            entries.push(RenameJournalEntry {
                id: note_id.clone(),
                note_exists,
                backup_exists,
            });
        }
        #[cfg(unix)]
        fs::File::open(&journal_directory)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| {
                format!("Não foi possível confirmar a cópia da renomeação: {error}")
            })?;
        let manifest = RenameJournalManifest {
            version: 1,
            notes: entries,
        };
        let bytes = serde_json::to_vec(&manifest)
            .map_err(|error| format!("Não foi possível registrar a renomeação: {error}"))?;
        crate::storage::atomic_write(&journal_directory.join("manifest.json"), &bytes, None)
    })();

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&journal_directory);
        return Err(error);
    }

    Ok(NoteRenameJournal {
        directory: journal_directory,
        snapshots,
    })
}

pub(crate) fn rollback_note_rename_journal(journal: &NoteRenameJournal) -> Result<(), String> {
    restore_note_files(&journal.snapshots)?;
    fs::remove_dir_all(&journal.directory)
        .map_err(|error| format!("Não foi possível remover o journal da renomeação: {error}"))
}

pub(crate) fn commit_note_rename_journal(journal: &NoteRenameJournal) -> Result<(), String> {
    let parent = journal
        .directory
        .parent()
        .ok_or_else(|| "Pasta do journal de renomeação inválida.".to_string())?;
    let committed = parent.join(format!(".rename-committed-{}", Uuid::now_v7()));
    fs::rename(&journal.directory, &committed)
        .map_err(|error| format!("Não foi possível confirmar a renomeação: {error}"))?;
    let _ = fs::remove_dir_all(committed);
    Ok(())
}

pub(crate) fn recover_note_rename_journal(
    directory: &Path,
    backups_directory: &Path,
) -> Result<(), String> {
    if !backups_directory.exists() {
        return Ok(());
    }
    let journal_directory = backups_directory.join(RENAME_JOURNAL_DIRECTORY);
    match fs::symlink_metadata(&journal_directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("Journal de renomeação inválido.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            cleanup_committed_rename_journals(backups_directory)?;
            return Ok(());
        }
        Err(error) => return Err(format!("Não foi possível verificar o journal: {error}")),
    }
    let manifest_path = journal_directory.join("manifest.json");
    match fs::symlink_metadata(&manifest_path) {
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() <= MAX_RENAME_MANIFEST_BYTES => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::remove_dir_all(&journal_directory).map_err(|error| {
                format!("Não foi possível limpar um journal incompleto: {error}")
            })?;
            cleanup_committed_rename_journals(backups_directory)?;
            return Ok(());
        }
        _ => return Err("Manifesto do journal de renomeação inválido.".into()),
    }
    let manifest: RenameJournalManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|error| format!("Não foi possível ler o journal de renomeação: {error}"))?,
    )
    .map_err(|error| format!("Journal de renomeação inválido: {error}"))?;
    if manifest.version != 1 {
        return Err("Versão do journal de renomeação incompatível.".into());
    }
    let mut restored_ids = std::collections::HashSet::new();
    for entry in manifest.notes.iter().rev() {
        validate_note_id(&entry.id)?;
        if !restored_ids.insert(entry.id.as_str()) {
            return Err("Journal de renomeação contém notas duplicadas.".into());
        }
        restore_journal_file(
            &journal_directory,
            &note_path(directory, &entry.id),
            &entry.id,
            "note",
            entry.note_exists,
        )?;
        restore_journal_file(
            &journal_directory,
            &note_backup_path(backups_directory, &entry.id),
            &entry.id,
            "backup",
            entry.backup_exists,
        )?;
    }
    fs::remove_dir_all(&journal_directory).map_err(|error| {
        format!("Não foi possível finalizar a recuperação da renomeação: {error}")
    })?;
    cleanup_committed_rename_journals(backups_directory)
}

fn restore_journal_file(
    journal_directory: &Path,
    destination: &Path,
    note_id: &str,
    suffix: &str,
    existed: bool,
) -> Result<(), String> {
    if existed {
        let snapshot_path = journal_directory.join(format!("{note_id}.{suffix}"));
        let metadata = fs::symlink_metadata(&snapshot_path)
            .map_err(|error| format!("Cópia de recuperação ausente: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("Cópia de recuperação inválida.".into());
        }
        let contents = fs::read(snapshot_path)
            .map_err(|error| format!("Não foi possível ler a cópia de recuperação: {error}"))?;
        crate::storage::atomic_write(destination, &contents, None)
    } else {
        match fs::remove_file(destination) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Não foi possível restaurar a renomeação: {error}")),
        }
    }
}

fn cleanup_committed_rename_journals(backups_directory: &Path) -> Result<(), String> {
    let entries = fs::read_dir(backups_directory)
        .map_err(|error| format!("Não foi possível ler arquivos temporários: {error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Não foi possível ler arquivos temporários: {error}"))?;
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with(".rename-committed-")
        {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Não foi possível verificar um journal concluído: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Journal concluído inválido.".into());
        }
        fs::remove_dir_all(entry.path())
            .map_err(|error| format!("Não foi possível limpar um journal concluído: {error}"))?;
    }
    Ok(())
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
