use super::{Deck, Kind};
use std::{
    fs,
    io::{BufReader, Read},
    path::{Path, PathBuf},
};
use tauri::AppHandle;

const MAX_BYTES: u64 = 4_000_000;
const MAX_ITEMS: usize = 1000;
const KINDS: [Kind; 5] = [
    Kind::Flashcards,
    Kind::Quiz,
    Kind::Written,
    Kind::Cloze,
    Kind::Correction,
];
fn folder(kind: Kind) -> &'static str {
    match kind {
        Kind::Flashcards => "flashcards",
        Kind::Quiz => "quiz",
        Kind::Written => "written",
        Kind::Cloze => "cloze",
        Kind::Correction => "correction",
    }
}
fn directory(path: &Path, create: bool) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if create {
                fs::create_dir(path).map_err(|_| "STUDY_STORAGE_FAILED")?;
            }
            Ok(create)
        }
        _ => Err("STUDY_STORAGE_FAILED".into()),
    }
}
fn root(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    Ok(super::super::repository::data_directory(app, vault_id)?.join("studies"))
}
fn item_path(
    app: &AppHandle,
    vault_id: &str,
    kind: Kind,
    id: &str,
    create: bool,
) -> Result<PathBuf, String> {
    if uuid::Uuid::parse_str(id)
        .map_err(|_| "STUDY_STORAGE_FAILED")?
        .to_string()
        != id
    {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    let base = root(app, vault_id)?;
    directory(&base, create)?;
    let parent = base.join(folder(kind));
    directory(&parent, create)?;
    let path = parent.join(format!("{id}.json"));
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("STUDY_STORAGE_FAILED".into()),
    }
    Ok(path)
}
struct Entry {
    path: PathBuf,
    kind: Kind,
    id: String,
    bytes: u64,
}
/** Scan only filenames and sizes when saving; other study items are untouched. */
fn entries(app: &AppHandle, vault_id: &str) -> Result<Vec<Entry>, String> {
    let base = root(app, vault_id)?;
    if !directory(&base, false)? {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    let mut ids = std::collections::HashSet::new();
    let mut bytes: u64 = 0;
    for kind in KINDS {
        let parent = base.join(folder(kind));
        if !directory(&parent, false)? {
            continue;
        }
        for entry in fs::read_dir(parent).map_err(|_| "STUDY_STORAGE_FAILED")? {
            let entry = entry.map_err(|_| "STUDY_STORAGE_FAILED")?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let metadata = fs::symlink_metadata(&path).map_err(|_| "STUDY_STORAGE_FAILED")?;
            let id = path
                .file_stem()
                .and_then(|name| name.to_str())
                .ok_or("STUDY_STORAGE_FAILED")?
                .to_string();
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || uuid::Uuid::parse_str(&id)
                    .map_err(|_| "STUDY_STORAGE_FAILED")?
                    .to_string()
                    != id
                || !ids.insert(id.clone())
            {
                return Err("STUDY_STORAGE_FAILED".into());
            }
            bytes = bytes
                .checked_add(metadata.len())
                .ok_or("STUDY_STORAGE_FAILED")?;
            if result.len() >= MAX_ITEMS || bytes > MAX_BYTES {
                return Err("STUDY_STORAGE_FAILED".into());
            }
            result.push(Entry {
                path,
                kind,
                id,
                bytes: metadata.len(),
            });
        }
    }
    result.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(result)
}
fn read_file(path: &Path, kind: Kind, id: &str) -> Result<Deck, String> {
    let file = fs::File::open(path).map_err(|_| "STUDY_STORAGE_FAILED")?;
    if file.metadata().map_err(|_| "STUDY_STORAGE_FAILED")?.len() > MAX_BYTES {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    let mut bytes = Vec::new();
    BufReader::new(file.take(MAX_BYTES + 1))
        .read_to_end(&mut bytes)
        .map_err(|_| "STUDY_STORAGE_FAILED")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    let deck: Deck = serde_json::from_slice(&bytes).map_err(|_| "STUDY_STORAGE_FAILED")?;
    if deck.id != id || deck.kind != kind {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    super::validate(&deck).map_err(|_| "STUDY_STORAGE_FAILED")?;
    Ok(deck)
}
pub(super) fn read_each(
    app: &AppHandle,
    vault_id: &str,
    mut receive: impl FnMut(Kind, &str, Result<Deck, String>) -> Result<(), String>,
) -> Result<usize, String> {
    let entries = entries(app, vault_id)?;
    for entry in &entries {
        receive(
            entry.kind,
            &entry.id,
            read_file(&entry.path, entry.kind, &entry.id),
        )?;
    }
    Ok(entries.len())
}
pub(super) fn read(app: &AppHandle, vault_id: &str, kind: Kind, id: &str) -> Result<Deck, String> {
    read_file(&item_path(app, vault_id, kind, id, false)?, kind, id)
}
pub(super) fn write(
    app: &AppHandle,
    vault_id: &str,
    deck: &Deck,
    existing_only: bool,
) -> Result<(), String> {
    let path = item_path(app, vault_id, deck.kind, &deck.id, true)?;
    let entries = entries(app, vault_id)?;
    let previous = entries.iter().find(|entry| entry.id == deck.id);
    if previous.is_some_and(|entry| entry.kind != deck.kind) || existing_only && previous.is_none()
    {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    if previous.is_none() && entries.len() >= MAX_ITEMS {
        return Err("STUDY_LIMIT_REACHED".into());
    }
    let bytes = serde_json::to_vec_pretty(deck).map_err(|_| "STUDY_STORAGE_FAILED")?;
    let total: u64 = entries.iter().map(|entry| entry.bytes).sum();
    if total - previous.map_or(0, |entry| entry.bytes) + bytes.len() as u64 > MAX_BYTES {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&path, &bytes, None).map_err(|_| "STUDY_STORAGE_FAILED".into())
}
pub(super) fn delete(app: &AppHandle, vault_id: &str, kind: Kind, id: &str) -> Result<(), String> {
    match fs::remove_file(item_path(app, vault_id, kind, id, false)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("STUDY_STORAGE_FAILED".into()),
    }
}
