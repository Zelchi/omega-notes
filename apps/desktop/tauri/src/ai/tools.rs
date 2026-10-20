use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{app::runtime, notes, vaults};

mod catalog;
mod connections;
mod library;
mod linking;
mod reading;
mod structure;

pub(crate) fn resolve_vault(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
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

pub(crate) fn allowed_for(purpose: super::task::Purpose, tool: &str) -> bool {
    match purpose {
        super::task::Purpose::Chat => tool != "read_study_context",
        super::task::Purpose::StudyGeneration | super::task::Purpose::StudyEvaluation => {
            tool == "read_study_context"
        }
    }
}

pub(super) fn definitions_for(purpose: super::task::Purpose) -> Value {
    let definitions = definitions();
    Value::Array(
        definitions
            .as_array()
            .unwrap()
            .iter()
            .filter(|tool| allowed_for(purpose, tool["name"].as_str().unwrap_or_default()))
            .cloned()
            .map(|mut tool| {
                if purpose.is_study() {
                    if let Some(description) = tool["description"].as_str() {
                        tool["description"] = json!(description
                            .split(" When mentioning an existing note,")
                            .next()
                            .unwrap_or(description));
                    }
                }
                tool
            })
            .collect(),
    )
}

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

pub(super) fn text(note: &notes::StudyNote) -> String {
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
pub(super) fn is_mutation(tool: &str) -> bool {
    tool == "link_note_mentions"
}
fn required_note(directory: &Path, args: &Value, key: &str) -> Result<notes::StudyNote, String> {
    let id = args[key].as_str().ok_or("AI_NOTE_NOT_FOUND")?;
    notes::validate_note_id(id)?;
    read(&notes::note_path(directory, id))
}

pub(super) fn context_excerpt(contents: &str, offset: usize, limit: usize) -> Value {
    reading::excerpt(contents, offset, limit)
}

pub(super) fn call_for_request(
    directory: &Path,
    request_id: &str,
    tool: &str,
    args: &Value,
) -> Result<Value, String> {
    if tool != "read_study_context" {
        return call(directory, tool, args);
    }
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
    super::study_context::read(directory, request_id, args)
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
        "link_note_mentions" => linking::prepare(directory, args),
        _ => Err("AI_UNKNOWN_TOOL".into()),
    }
}
