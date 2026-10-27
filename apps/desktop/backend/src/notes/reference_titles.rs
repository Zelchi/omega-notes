use super::{
    deleted_notes_directory, note_from_path, validate_note_id, validate_note_title, NoteLoadIssue,
};
use crate::storage::atomic_write;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, LazyLock, Mutex, Weak},
};

const FILE: &str = ".reference-titles.json";
static TITLE_LOCKS: LazyLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn title_lock_for_directory(directory: &Path) -> Result<Arc<Mutex<()>>, String> {
    let key = directory
        .canonicalize()
        .unwrap_or_else(|_| directory.to_path_buf());
    let mut locks = TITLE_LOCKS
        .lock()
        .map_err(|_| "Não foi possível acessar os títulos de referências.".to_string())?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return Ok(lock);
    }

    let lock = Arc::new(Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    Ok(lock)
}

fn read(directory: &Path) -> Result<HashMap<String, String>, String> {
    let path = directory.join(FILE);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() <= 16 * 1024 * 1024 => {}
        _ => return Err("Não foi possível ler os títulos das referências apagadas.".into()),
    }
    let titles: HashMap<String, String> =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("Títulos de referências inválidos: {error}"))?;
    for (id, title) in &titles {
        validate_note_id(id)?;
        if title.trim().is_empty() {
            return Err("Título de referência vazio.".into());
        }
    }
    Ok(titles)
}
fn write(directory: &Path, titles: &HashMap<String, String>) -> Result<(), String> {
    let bytes = serde_json::to_vec(titles).map_err(|error| error.to_string())?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Limite de títulos de referências atingido.".into());
    }
    atomic_write(&directory.join(FILE), &bytes, None)
}
pub(crate) fn remember_reference_title(
    directory: &Path,
    id: &str,
    title: &str,
) -> Result<(), String> {
    let title_lock = title_lock_for_directory(directory)?;
    let _guard = title_lock
        .lock()
        .map_err(|_| "Não foi possível preservar o título da nota.")?;
    validate_note_id(id)?;
    validate_note_title(title)?;
    let mut titles = read(directory)?;
    if titles.get(id).is_some_and(|current| current == title) {
        return Ok(());
    }
    titles.insert(id.into(), title.into());
    write(directory, &titles)
}

pub(crate) fn load_reference_titles(
    directory: &Path,
) -> (HashMap<String, String>, Vec<NoteLoadIssue>) {
    load_reference_titles_internal(directory, None)
        .unwrap_or_else(|error| (HashMap::new(), vec![issue(error)]))
}

pub(crate) fn load_reference_titles_cancellable(
    directory: &Path,
    cancelled: &AtomicBool,
) -> Result<(HashMap<String, String>, Vec<NoteLoadIssue>), String> {
    load_reference_titles_internal(directory, Some(cancelled))
}

fn load_reference_titles_internal(
    directory: &Path,
    cancelled: Option<&AtomicBool>,
) -> Result<(HashMap<String, String>, Vec<NoteLoadIssue>), String> {
    let mut titles = HashMap::new();
    let mut issues = Vec::new();
    let result = (|| -> Result<(), String> {
        ensure_not_cancelled(cancelled)?;
        let title_lock = title_lock_for_directory(directory)?;
        let _guard = title_lock
            .lock()
            .map_err(|_| "Não foi possível ler os títulos de referências.")?;
        ensure_not_cancelled(cancelled)?;
        titles = read(directory)?;
        ensure_not_cancelled(cancelled)?;
        let archive = deleted_notes_directory(directory);
        if !archive.exists() {
            return Ok(());
        }
        let metadata = fs::symlink_metadata(&archive).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Diretório de notas apagadas inválido.".into());
        }
        let (paths, errors) = note_paths_cancellable(&archive, cancelled)?;
        for error in errors {
            ensure_not_cancelled(cancelled)?;
            issues.push(issue(error));
        }
        let mut changed = false;
        for path in paths.iter().filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "omega")
        }) {
            ensure_not_cancelled(cancelled)?;
            let id = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .ok_or_else(|| "Identificador de nota apagada inválido.".to_string())?;
            if titles.contains_key(id) {
                continue;
            }
            let note = (|| {
                if fs::symlink_metadata(path)
                    .map_err(|error| error.to_string())?
                    .file_type()
                    .is_symlink()
                {
                    return Err("Referência de nota apagada aponta para um link simbólico.".into());
                }
                let note = note_from_path(path)?;
                ensure_not_cancelled(cancelled)?;
                validate_note_id(&note.id)?;
                validate_note_title(&note.title)?;
                Ok(note)
            })();
            match note {
                Ok(note) => {
                    if let std::collections::hash_map::Entry::Vacant(entry) = titles.entry(note.id)
                    {
                        entry.insert(note.title);
                        changed = true;
                    }
                }
                Err(error) => issues.push(issue(error)),
            }
        }
        if changed {
            ensure_not_cancelled(cancelled)?;
            write(directory, &titles)?;
        }
        ensure_not_cancelled(cancelled)?;
        Ok(())
    })();
    match result {
        Ok(()) => Ok((titles, issues)),
        Err(error) if error == "NOTE_READ_CANCELLED" => Err(error),
        Err(error) => {
            issues.push(issue(error));
            Ok((titles, issues))
        }
    }
}

fn ensure_not_cancelled(cancelled: Option<&AtomicBool>) -> Result<(), String> {
    if cancelled.is_some_and(|flag| flag.load(std::sync::atomic::Ordering::Relaxed)) {
        Err("NOTE_READ_CANCELLED".into())
    } else {
        Ok(())
    }
}

fn note_paths_cancellable(
    directory: &Path,
    cancelled: Option<&AtomicBool>,
) -> Result<(Vec<PathBuf>, Vec<String>), String> {
    let entries = fs::read_dir(directory).map_err(|error| error.to_string())?;
    let mut paths = Vec::new();
    let mut errors = Vec::new();
    for entry in entries {
        ensure_not_cancelled(cancelled)?;
        match entry {
            Ok(entry) => paths.push(entry.path()),
            Err(error) => errors.push(error.to_string()),
        }
    }
    Ok((paths, errors))
}
fn issue(message: String) -> NoteLoadIssue {
    NoteLoadIssue {
        file_name: FILE.into(),
        message,
        recovery_path: None,
        recovered: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_title_work_in_different_vaults_is_independent() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first_lock = title_lock_for_directory(first.path()).unwrap();
        let second_lock = title_lock_for_directory(second.path()).unwrap();
        let _held = first_lock.lock().unwrap();

        assert!(second_lock.try_lock().is_ok());
        assert!(first_lock.try_lock().is_err());
    }
}
