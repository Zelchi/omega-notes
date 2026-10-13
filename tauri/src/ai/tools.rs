use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{app::runtime, notes, vaults};

// The host binds the vault. The model never supplies a vault ID or file path.
pub(super) fn resolve_vault(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "AI_INVALID_VAULT".to_string())?;
    let directory = runtime::app_directory(app)?;
    let registry = vaults::read_vault_registry(&directory)?;
    if registry.active_vault_id.as_deref() != Some(id) {
        return Err("AI_VAULT_CHANGED".into());
    }
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == id)
        .ok_or("AI_INVALID_VAULT")?;
    let root = vaults::vault_directory(&directory, vault)?;
    let path = root.join("notes");
    for folder in [&root, &path] {
        if std::fs::symlink_metadata(folder)
            .map_err(|_| "AI_INVALID_VAULT")?
            .file_type()
            .is_symlink()
        {
            return Err("AI_INVALID_VAULT".into());
        }
    }
    path.canonicalize().map_err(|_| "AI_INVALID_VAULT".into())
}

pub(super) fn definitions() -> Value {
    json!([
        {"type":"function","name":"list_notes","description":"List notes in the authorized vault. Paginate with offset.",
         "inputSchema":{"type":"object","properties":{"offset":{"type":"integer","minimum":0}},"additionalProperties":false}},
        {"type":"function","name":"search_notes","description":"Search titles and text in the authorized vault. Paginate with offset.",
         "inputSchema":{"type":"object","properties":{"query":{"type":"string"},"offset":{"type":"integer","minimum":0}},"required":["query"],"additionalProperties":false}},
        {"type":"function","name":"read_note","description":"Read a note in the authorized vault. Returns text only. Paginate long notes with offset (characters).",
         "inputSchema":{"type":"object","properties":{"noteId":{"type":"string"},"offset":{"type":"integer","minimum":0}},"required":["noteId"],"additionalProperties":false}}
    ])
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

fn text(note: &notes::StudyNote) -> String {
    let document = serde_json::to_value(&note.document).unwrap_or(Value::Null);
    document["elements"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|element| element["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn call(directory: &Path, tool: &str, args: &Value) -> Result<Value, String> {
    let offset = args["offset"].as_u64().unwrap_or(0).min(usize::MAX as u64) as usize;
    if tool == "read_note" {
        let id = args["noteId"].as_str().ok_or("AI_NOTE_NOT_FOUND")?;
        notes::validate_note_id(id)?;
        let note = read(&notes::note_path(directory, id))?;
        let contents = text(&note);
        let total = contents.chars().count();
        let excerpt: String = contents.chars().skip(offset).take(16_000).collect();
        let end = offset.saturating_add(excerpt.chars().count());
        return Ok(
            json!({"id":note.id,"title":note.title,"text":excerpt,"totalCharacters":total,"nextOffset":(end < total).then_some(end)}),
        );
    }
    if tool != "list_notes" && tool != "search_notes" {
        return Err("AI_UNKNOWN_TOOL".into());
    }
    let query = if tool == "search_notes" {
        args["query"]
            .as_str()
            .ok_or("AI_INVALID_QUERY")?
            .trim()
            .to_lowercase()
    } else {
        String::new()
    };
    if query.len() > 1000 {
        return Err("AI_INVALID_QUERY".into());
    }
    let (mut paths, _) = notes::note_paths(directory).map_err(|_| "AI_READ_FAILED")?;
    paths.sort();
    let mut matches = Vec::new();
    let mut count = 0usize;
    let limit = if tool == "search_notes" { 20 } else { 100 };
    let mut issues = 0usize;
    for path in paths
        .iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "omega"))
    {
        let note = match read(path) {
            Ok(note) => note,
            Err(_) => {
                issues += 1;
                continue;
            }
        };
        let contents = if tool == "search_notes" {
            text(&note)
        } else {
            String::new()
        };
        if !query.is_empty()
            && !note.title.to_lowercase().contains(&query)
            && !contents.to_lowercase().contains(&query)
        {
            continue;
        }
        if count >= offset && matches.len() < limit {
            matches.push(json!({"id":note.id,"title":note.title,"preview":note.preview.chars().take(600).collect::<String>()}));
        }
        count += 1;
    }
    let end = offset.saturating_add(matches.len());
    Ok(
        json!({"notes":matches,"total":count,"unreadableNotes":issues,"nextOffset":(end < count).then_some(end)}),
    )
}
