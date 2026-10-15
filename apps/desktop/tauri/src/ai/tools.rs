use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{app::runtime, notes, vaults};

mod catalog;
mod connections;
mod library;
mod reading;
mod structure;

pub(super) fn resolve_vault(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "AI_INVALID_VAULT".to_string())?;
    let directory = runtime::app_directory(app)?;
    resolve_vault_in(&directory, id)
}

pub(super) fn resolve_vault_in(directory: &Path, id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "AI_INVALID_VAULT".to_string())?;
    let registry = vaults::read_vault_registry(directory)?;
    if registry.active_vault_id.as_deref() != Some(id) {
        return Err("AI_VAULT_CHANGED".into());
    }
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == id)
        .ok_or("AI_INVALID_VAULT")?;
    let root = vaults::vault_directory(directory, vault)?;
    let path = root.join("notes");
    let base = directory.join("vaults");
    for folder in [&base, &root, &path] {
        let metadata = std::fs::symlink_metadata(folder).map_err(|_| "AI_INVALID_VAULT")?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("AI_INVALID_VAULT".into());
        }
    }
    path.canonicalize().map_err(|_| "AI_INVALID_VAULT".into())
}

pub(super) use catalog::definitions;
pub(crate) use catalog::names;

fn read(path: &Path) -> Result<notes::StudyNote, String> {
    if std::fs::symlink_metadata(path)
        .map_err(|_| "AI_NOTE_NOT_FOUND")?
        .file_type()
        .is_symlink()
    {
        return Err("AI_NOTE_NOT_FOUND".into());
    }
    notes::note_from_path(path)
}

fn text(note: &notes::StudyNote) -> String {
    note.document
        .elements
        .iter()
        .filter_map(|element| match element {
            notes::NoteElement::Text { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn offset(args: &Value) -> usize {
    args["offset"].as_u64().unwrap_or(0).min(usize::MAX as u64) as usize
}

fn reference(id: &str) -> String {
    format!("[[{id}]]")
}
fn required_note(directory: &Path, args: &Value, key: &str) -> Result<notes::StudyNote, String> {
    let id = args[key].as_str().ok_or("AI_NOTE_NOT_FOUND")?;
    notes::validate_note_id(id)?;
    read(&notes::note_path(directory, id))
}

pub(super) fn call(directory: &Path, tool: &str, args: &Value) -> Result<Value, String> {
    let definitions = definitions();
    let definition = definitions
        .as_array()
        .unwrap()
        .iter()
        .find(|definition| definition["name"] == tool)
        .ok_or("AI_UNKNOWN_TOOL")?;
    let empty = json!({});
    let args = if args.is_null() { &empty } else { args };
    catalog::validate(&definition["inputSchema"], args)?;
    match tool {
        "list_notes" | "search_notes" => reading::list(directory, args, tool == "search_notes"),
        "read_note" => reading::read_one(directory, args),
        "read_notes" => reading::read_many(directory, args),
        "get_note_outline" => structure::outline(directory, args),
        "read_note_section" => structure::read_section(directory, args),
        "list_note_connections" => connections::list(directory, args),
        "get_vault_overview" => connections::overview(directory),
        "find_unresolved_links" => connections::unresolved(directory, args),
        "find_connection_path" => connections::path(directory, args),
        _ => Err("AI_UNKNOWN_TOOL".into()),
    }
}
