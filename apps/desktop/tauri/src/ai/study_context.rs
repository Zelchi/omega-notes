use super::tools;
use crate::notes;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};
use tauri::AppHandle;

const MAX_BYTES: usize = 64_000_000;
const LIFETIME: Duration = Duration::from_secs(600);
const CACHE_BYTES: usize = 16_000_000;
const CACHE_ENTRIES: usize = 128;
static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(Registry::default()));

#[derive(Default)]
struct Registry {
    generation: u64,
    contexts: HashMap<String, Arc<Context>>,
    sources: HashMap<PathBuf, CachedSource>,
}
struct SourceContent {
    title: String,
    text: String,
    characters: usize,
}
struct CachedSource {
    stored: String,
    content: Arc<SourceContent>,
    used: Instant,
}
impl CachedSource {
    fn bytes(&self) -> usize {
        self.stored.len() + self.content.title.len() + self.content.text.len()
    }
}

pub(super) fn clear() {
    if let Ok(mut registry) = REGISTRY.lock() {
        let generation = registry.generation.wrapping_add(1);
        let removed = std::mem::replace(
            &mut *registry,
            Registry {
                generation,
                ..Registry::default()
            },
        );
        drop(registry);
        drop(removed);
    }
}

fn source(directory: &Path, id: &str, generation: u64) -> Result<Arc<SourceContent>, String> {
    notes::validate_note_id(id)?;
    let path = notes::note_path(directory, id);
    if std::fs::symlink_metadata(&path)
        .map_err(|_| "AI_NOTE_NOT_FOUND")?
        .file_type()
        .is_symlink()
    {
        return Err("AI_NOTE_NOT_FOUND".into());
    }
    let stored = std::fs::read_to_string(&path).map_err(|_| "AI_NOTE_NOT_FOUND")?;
    {
        let mut registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if registry.generation != generation {
            return Err("AI_CANCELLED".into());
        }
        registry
            .sources
            .retain(|_, entry| entry.used.elapsed() < LIFETIME);
        if let Some(entry) = registry.sources.get_mut(&path) {
            if entry.stored == stored {
                entry.used = Instant::now();
                return Ok(entry.content.clone());
            }
        }
        registry.sources.remove(&path);
    }
    let note = notes::note_from_contents(&path, id, &stored)?;
    let text = tools::text(&note);
    let content = Arc::new(SourceContent {
        title: note.title,
        characters: text.chars().count(),
        text,
    });
    let entry = CachedSource {
        stored,
        content: content.clone(),
        used: Instant::now(),
    };
    let mut registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
    if registry.generation != generation {
        return Err("AI_CANCELLED".into());
    }
    if entry.bytes() <= CACHE_BYTES {
        registry.sources.remove(&path);
        let mut bytes: usize = registry.sources.values().map(CachedSource::bytes).sum();
        while registry.sources.len() >= CACHE_ENTRIES || bytes + entry.bytes() > CACHE_BYTES {
            let oldest = registry
                .sources
                .iter()
                .min_by_key(|(_, value)| value.used)
                .map(|(path, _)| path.clone());
            let Some(oldest) = oldest else {
                break;
            };
            if let Some(removed) = registry.sources.remove(&oldest) {
                bytes -= removed.bytes();
            }
        }
        registry.sources.insert(path, entry);
    }
    Ok(content)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Assignment {
    item_id: String,
    note_id: String,
    source_ids: Vec<String>,
    supporting_note_ids: Vec<String>,
}
struct Source {
    id: String,
    alias: String,
    content: Arc<SourceContent>,
    used_by: Vec<usize>,
}
struct Context {
    directory: PathBuf,
    created: Instant,
    items: Vec<Assignment>,
    notes: Vec<Source>,
}

#[tauri::command]
pub(crate) async fn prepare_study_context(
    app: AppHandle,
    vault_id: String,
    request_id: String,
    items: Vec<Assignment>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        uuid::Uuid::parse_str(&request_id).map_err(|_| "AI_INVALID_MESSAGE")?;
        if items.is_empty() || items.len() > 30 {
            return Err("AI_INVALID_MESSAGE".into());
        }
        let generation = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?.generation;
        let directory = tools::resolve_vault(&app, &vault_id)?;
        let mut notes: Vec<Source> = Vec::new();
        let mut index: HashMap<String, usize> = HashMap::new();
        let mut bytes = serde_json::to_vec(&items)
            .map_err(|_| "AI_INVALID_MESSAGE")?
            .len();
        if bytes > MAX_BYTES {
            return Err("AI_INVALID_MESSAGE".into());
        }
        let mut item_ids = HashSet::new();
        for (position, item) in items.iter().enumerate() {
            if item.item_id.is_empty()
                || item.item_id.len() > 64
                || !item_ids.insert(&item.item_id)
                || !item.source_ids.contains(&item.note_id)
                || item
                    .supporting_note_ids
                    .iter()
                    .any(|id| !item.source_ids.contains(id))
            {
                return Err("AI_INVALID_MESSAGE".into());
            }
            let mut seen = HashSet::new();
            for id in &item.source_ids {
                if !seen.insert(id) {
                    continue;
                }
                if let Some(&source_index) = index.get(id) {
                    notes[source_index].used_by.push(position + 1);
                    continue;
                }
                let content = source(&directory, id, generation)?;
                bytes = bytes
                    .checked_add(content.text.len() + content.title.len() + id.len())
                    .ok_or("AI_INVALID_MESSAGE")?;
                if bytes > MAX_BYTES {
                    return Err("AI_INVALID_MESSAGE".into());
                }
                index.insert(id.clone(), notes.len());
                notes.push(Source {
                    id: id.clone(),
                    alias: format!("N{}", notes.len() + 1),
                    content,
                    used_by: vec![position + 1],
                });
            }
        }
        if tools::resolve_vault(&app, &vault_id)? != directory {
            return Err("AI_VAULT_CHANGED".into());
        }
        let mut registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if registry.generation != generation {
            return Err("AI_CANCELLED".into());
        }
        let contexts = &mut registry.contexts;
        contexts.retain(|_, context| context.created.elapsed() < LIFETIME);
        if contexts.len() >= 8 || contexts.contains_key(&request_id) {
            return Err("AI_BUSY".into());
        }
        contexts.insert(
            request_id,
            Arc::new(Context {
                directory,
                created: Instant::now(),
                items,
                notes,
            }),
        );
        Ok(())
    })
    .await
    .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn validate_study_context(
    app: AppHandle,
    vault_id: String,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = tools::resolve_vault(&app, &vault_id)?;
        let (context, generation) = {
            let registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
            let context = registry
                .contexts
                .get(&request_id)
                .cloned()
                .ok_or("AI_STUDY_CONTEXT_UNAVAILABLE")?;
            (context, registry.generation)
        };
        if context.directory != directory {
            return Err("AI_VAULT_CHANGED".into());
        }
        for note in &context.notes {
            let current = source(&directory, &note.id, generation).map_err(|error| {
                if error == "AI_CANCELLED" {
                    error
                } else {
                    "STUDY_SOURCES_CHANGED".into()
                }
            })?;
            if current.title != note.content.title || current.text != note.content.text {
                return Err("STUDY_SOURCES_CHANGED".into());
            }
        }
        if tools::resolve_vault(&app, &vault_id)? != directory {
            return Err("AI_VAULT_CHANGED".into());
        }
        let registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if registry.generation != generation
            || !registry
                .contexts
                .get(&request_id)
                .is_some_and(|value| Arc::ptr_eq(value, &context))
        {
            return Err("AI_CANCELLED".into());
        }
        Ok(())
    })
    .await
    .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn release_study_context(request_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let removed = REGISTRY
            .lock()
            .map_err(|_| "AI_REQUEST_FAILED")?
            .contexts
            .remove(&request_id);
        drop(removed);
        Ok(())
    })
    .await
    .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}

pub(super) fn read(directory: &Path, request_id: &str, args: &Value) -> Result<Value, String> {
    let context = {
        let mut registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        let contexts = &mut registry.contexts;
        contexts.retain(|_, context| context.created.elapsed() < LIFETIME);
        contexts
            .get(request_id)
            .cloned()
            .ok_or("AI_STUDY_CONTEXT_UNAVAILABLE")?
    };
    if context.directory != directory {
        return Err("AI_VAULT_CHANGED".into());
    }
    let offset = args["offset"].as_u64().unwrap_or(0).min(usize::MAX as u64) as usize;
    if let Some(id) = args["sourceId"].as_str() {
        let note = context
            .notes
            .iter()
            .find(|note| note.alias == id)
            .ok_or("AI_NOTE_NOT_FOUND")?;
        let limit = args["limit"].as_u64().unwrap_or(16000) as usize;
        let mut result = tools::context_excerpt(&note.content.text, offset, limit);
        result["sourceId"] = json!(note.alias);
        result["title"] = json!(note.content.title);
        result["usedByItems"] = json!(note.used_by);
        return Ok(result);
    }
    let notes: Vec<_> = context
        .notes
        .iter()
        .skip(offset)
        .take(50)
        .map(|note| {
            json!({
                "sourceId":note.alias,"title":note.content.title,
                "totalCharacters":note.content.characters,"usedByItems":note.used_by
            })
        })
        .collect();
    let end = offset.saturating_add(notes.len());
    let alias_for = |id: &str| {
        context
            .notes
            .iter()
            .find(|note| note.id == id)
            .map(|note| note.alias.as_str())
    };
    let items: Vec<_> = context.items.iter().enumerate().map(|(index, item)| json!({
        "number":index + 1,"itemId":item.item_id,"primarySourceId":alias_for(&item.note_id),
        "supportingSourceIds":item.supporting_note_ids.iter().filter_map(|id| alias_for(id)).collect::<Vec<_>>()
    })).collect();
    Ok(
        json!({"items":items,"notes":notes,"totalNotes":context.notes.len(),
        "nextOffset":(end < context.notes.len()).then_some(end),"scope":"prepared-study-context"}),
    )
}

pub(crate) fn export_files(
    directory: &Path,
    request_id: &str,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let context = REGISTRY
        .lock()
        .map_err(|_| "AI_REQUEST_FAILED")?
        .contexts
        .get(request_id)
        .cloned()
        .ok_or("AI_STUDY_CONTEXT_UNAVAILABLE")?;
    if context.directory != directory || context.created.elapsed() >= LIFETIME {
        return Err("AI_STUDY_CONTEXT_UNAVAILABLE".into());
    }
    let mut manifest = read(directory, request_id, &json!({}))?;
    let mut offset = manifest["nextOffset"].as_u64();
    while let Some(next) = offset {
        let page = read(directory, request_id, &json!({"offset":next}))?;
        manifest["notes"]
            .as_array_mut()
            .ok_or("AI_REQUEST_FAILED")?
            .extend(
                page["notes"]
                    .as_array()
                    .ok_or("AI_REQUEST_FAILED")?
                    .iter()
                    .cloned(),
            );
        offset = page["nextOffset"].as_u64();
    }
    manifest["nextOffset"] = Value::Null;
    let mut files = vec![(
        "manifest.json".into(),
        serde_json::to_vec_pretty(&manifest).map_err(|_| "AI_REQUEST_FAILED")?,
    )];
    for source in &context.notes {
        files.push((
            format!("{}.txt", source.alias),
            source.content.text.as_bytes().to_vec(),
        ));
    }
    Ok(files)
}

#[cfg(test)]
#[path = "../../test/study_context.rs"]
mod tests;
