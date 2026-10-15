use super::{
    deleted_notes_directory, note_from_path, note_paths, validate_note_id, validate_note_title,
    NoteLoadIssue,
};
use crate::storage::atomic_write;
use std::{collections::HashMap, fs, path::Path, sync::Mutex};

const FILE: &str = ".reference-titles.json";
static TITLES: Mutex<()> = Mutex::new(());

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
    let _guard = TITLES
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
    let mut titles = HashMap::new();
    let mut issues = Vec::new();
    let result = (|| -> Result<(), String> {
        let _guard = TITLES
            .lock()
            .map_err(|_| "Não foi possível ler os títulos de referências.")?;
        titles = read(directory)?;
        let archive = deleted_notes_directory(directory);
        if !archive.exists() {
            return Ok(());
        }
        let metadata = fs::symlink_metadata(&archive).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Diretório de notas apagadas inválido.".into());
        }
        let (paths, errors) = note_paths(&archive).map_err(|error| error.to_string())?;
        for error in errors {
            issues.push(issue(error));
        }
        let mut changed = false;
        for path in paths.iter().filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "omega")
        }) {
            let note = (|| {
                if fs::symlink_metadata(path)
                    .map_err(|error| error.to_string())?
                    .file_type()
                    .is_symlink()
                {
                    return Err("Referência de nota apagada aponta para um link simbólico.".into());
                }
                let note = note_from_path(path)?;
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
            write(directory, &titles)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        issues.push(issue(error));
    }
    (titles, issues)
}
fn issue(message: String) -> NoteLoadIssue {
    NoteLoadIssue {
        file_name: FILE.into(),
        message,
        recovery_path: None,
        recovered: false,
    }
}
