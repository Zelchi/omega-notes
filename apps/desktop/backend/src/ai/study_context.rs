use super::markdown_segments as segments;
use super::tools;
use crate::notes;
use crate::runtime::AppContext;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};

const MAX_BYTES: usize = 64_000_000;
const MAX_ACTIVE_CONTEXT_BYTES: usize = 128_000_000;
const LIFETIME: Duration = Duration::from_secs(600);
const CACHE_BYTES: usize = 16_000_000;
const CACHE_ENTRIES: usize = 128;
const MIN_STUDY_CHARACTERS: usize = 180;
const MIN_STUDY_WORDS: usize = 25;
const MIN_STUDY_LINES: usize = 3;
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
    words: usize,
    lines: usize,
    segments: Vec<segments::Segment>,
}
struct CachedSource {
    stored: String,
    content: Arc<SourceContent>,
    used: Instant,
}
impl CachedSource {
    fn bytes(&self) -> usize {
        self.stored.len()
            + self.content.title.len()
            + self.content.text.len()
            + segments::estimated_memory_bytes(&self.content.segments)
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
    let (characters, words, lines) = study_content_stats(&text);
    let content_segments = segments::build(&text);
    let content = Arc::new(SourceContent {
        title: note.title,
        characters,
        text,
        words,
        lines,
        segments: content_segments,
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

fn study_content_stats(text: &str) -> (usize, usize, usize) {
    let characters = text.chars().count();
    let words = text
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .count();
    let lines = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.chars().count().saturating_add(79) / 80)
        .sum();
    (characters, words, lines)
}

fn has_sufficient_study_content(characters: usize, words: usize, lines: usize) -> bool {
    characters >= MIN_STUDY_CHARACTERS && words >= MIN_STUDY_WORDS && lines >= MIN_STUDY_LINES
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Assignment {
    item_id: String,
    candidate_id: String,
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
    memory_bytes: usize,
    items: Vec<Assignment>,
    notes: Vec<Source>,
}

pub(crate) async fn prepare_study_context(
    app: AppContext,
    vault_id: String,
    request_id: String,
    items: Vec<Assignment>,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
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
                || item.source_ids.len() > 16
                || item
                    .supporting_note_ids
                    .iter()
                    .any(|id| !item.source_ids.contains(id))
            {
                return Err("AI_INVALID_MESSAGE".into());
            }
            source(&directory, &item.candidate_id, generation).map_err(|error| {
                if error == "AI_NOTE_NOT_FOUND" {
                    "STUDY_SOURCE_MISSING".to_string()
                } else {
                    error
                }
            })?;
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
                if !tools::has_text(&content.text) && id == &item.note_id {
                    return Err("AI_STUDY_SOURCE_EMPTY".into());
                }
                bytes = bytes
                    .checked_add(
                        content.text.len()
                            + content.title.len()
                            + id.len()
                            + segments::estimated_memory_bytes(&content.segments),
                    )
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
        for item in &items {
            let mut seen = HashSet::new();
            let mut characters = 0;
            let mut words = 0;
            let mut lines = 0;
            for id in &item.source_ids {
                if !seen.insert(id) {
                    continue;
                }
                let Some(&source_index) = index.get(id) else {
                    return Err("AI_INVALID_MESSAGE".into());
                };
                let content = &notes[source_index].content;
                if tools::has_text(&content.text) {
                    characters += content.characters;
                    words += content.words;
                    lines += content.lines;
                }
            }
            if !has_sufficient_study_content(characters, words, lines) {
                return Err("STUDY_INSUFFICIENT_CONTENT".into());
            }
        }
        if tools::resolve_vault(&app, &vault_id)? != directory {
            return Err("AI_STUDY_PREPARATION_VAULT_CHANGED".into());
        }
        let mut registry = REGISTRY.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if registry.generation != generation {
            return Err("AI_CANCELLED".into());
        }
        let contexts = &mut registry.contexts;
        contexts.retain(|_, context| context.created.elapsed() < LIFETIME);
        let active_bytes = contexts
            .values()
            .map(|context| context.memory_bytes)
            .sum::<usize>();
        if contexts.len() >= 8
            || contexts.contains_key(&request_id)
            || active_bytes.saturating_add(bytes) > MAX_ACTIVE_CONTEXT_BYTES
        {
            return Err("AI_BUSY".into());
        }
        contexts.insert(
            request_id,
            Arc::new(Context {
                directory,
                created: Instant::now(),
                memory_bytes: bytes,
                items,
                notes,
            }),
        );
        Ok(())
    })
    .await
    .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}

pub(crate) async fn validate_study_context(
    app: AppContext,
    vault_id: String,
    request_id: String,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
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
            return Err("AI_STUDY_VAULT_MISMATCH".into());
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
            return Err("AI_STUDY_VALIDATION_VAULT_CHANGED".into());
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

pub(crate) async fn release_study_context(request_id: String) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
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
        return Err("AI_STUDY_VAULT_MISMATCH".into());
    }
    let offset = args["offset"].as_u64().unwrap_or(0).min(usize::MAX as u64) as usize;
    if let Some(id) = args["sourceId"].as_str() {
        let note = context
            .notes
            .iter()
            .find(|note| note.alias == id)
            .ok_or("AI_NOTE_NOT_FOUND")?;
        let limit = args["limit"].as_u64().unwrap_or(16000) as usize;
        if let Some(segment_id) = args["segmentId"].as_u64() {
            let segment_id = usize::try_from(segment_id).map_err(|_| "AI_SEGMENT_NOT_FOUND")?;
            let segment = note
                .content
                .segments
                .iter()
                .find(|segment| segment.id == segment_id)
                .ok_or("AI_SEGMENT_NOT_FOUND")?;
            let mut result =
                tools::context_excerpt(segment.text(&note.content.text), offset, limit)?;
            result["sourceId"] = json!(note.alias);
            result["title"] = json!(note.content.title);
            result["usedByItems"] = json!(note.used_by);
            result["segment"] = segment.descriptor(&note.content.text);
            return Ok(result);
        }
        if !tools::has_text(&note.content.text) {
            return Err("AI_CONTENT_EMPTY".into());
        }
        let segment_offset = args["segmentOffset"]
            .as_u64()
            .unwrap_or(0)
            .min(usize::MAX as u64) as usize;
        if segment_offset > 0 && segment_offset >= note.content.segments.len() {
            return Err("AI_OFFSET_OUT_OF_RANGE".into());
        }
        let segment_summaries: Vec<_> = note
            .content
            .segments
            .iter()
            .skip(segment_offset)
            .take(100)
            .map(|segment| segment.descriptor(&note.content.text))
            .collect();
        let next_segment_offset = segment_offset.saturating_add(segment_summaries.len());
        let mut result = json!({
            "sourceId":note.alias,
            "title":note.content.title,
            "usedByItems":note.used_by,
            "contentAvailable":true,
            "totalCharacters":note.content.characters,
            "segments":segment_summaries,
            "totalSegments":note.content.segments.len(),
            "nextSegmentOffset":(next_segment_offset < note.content.segments.len()).then_some(next_segment_offset),
        });
        const INLINE_SOURCE_LIMIT: usize = 8_000;
        if note.content.characters <= INLINE_SOURCE_LIMIT {
            let excerpt = tools::context_excerpt(&note.content.text, offset, limit)?;
            result["text"] = excerpt["text"].clone();
            result["nextOffset"] = excerpt["nextOffset"].clone();
        } else if offset > 0 {
            return Err("AI_STUDY_SEGMENT_REQUIRED".into());
        } else {
            result["message"] = json!("This source is segmented. Select relevant text or table segments and read them by segmentId.");
        }
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
                "contentAvailable":tools::has_text(&note.content.text),
                "totalCharacters":note.content.characters,
                "segmentCount":note.content.segments.len(),
                "tableCount":note.content.segments.iter().filter(|segment| segment.kind == "table").count(),
                "usedByItems":note.used_by
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

pub(crate) fn export_to_directory(
    directory: &Path,
    request_id: &str,
    destination: &Path,
) -> Result<(), String> {
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
    let metadata = std::fs::symlink_metadata(destination).map_err(|_| "AI_STORAGE_FAILED")?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("AI_STORAGE_FAILED".into());
    }

    let aliases = context
        .notes
        .iter()
        .map(|note| (note.id.as_str(), note.alias.as_str()))
        .collect::<HashMap<_, _>>();
    let items: Vec<_> = context
        .items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            json!({
                "number": index + 1,
                "itemId": item.item_id,
                "primarySourceId": aliases.get(item.note_id.as_str()),
                "supportingSourceIds": item.supporting_note_ids.iter()
                    .filter_map(|id| aliases.get(id.as_str()).copied())
                    .collect::<Vec<_>>(),
            })
        })
        .collect();
    let mut manifest_notes = Vec::with_capacity(context.notes.len());
    for source in &context.notes {
        let content_available = tools::has_text(&source.content.text);
        let mut note = json!({
            "sourceId": source.alias,
            "title": source.content.title,
            "contentAvailable": content_available,
            "totalCharacters": source.content.characters,
            "segmentCount": source.content.segments.len(),
            "tableCount": source.content.segments.iter().filter(|segment| segment.kind == "table").count(),
            "usedByItems": source.used_by,
        });
        if content_available {
            let mut exported_segments = Vec::with_capacity(source.content.segments.len());
            for segment in &source.content.segments {
                let file = format!("{}-S{}.txt", source.alias, segment.id);
                let mut descriptor = segment.descriptor(&source.content.text);
                descriptor["file"] = json!(file);
                exported_segments.push(descriptor);
                crate::storage::atomic_write_with(&destination.join(file), None, |writer| {
                    segment.write_cli_text(&source.content.title, &source.content.text, writer)
                })?;
            }
            note["segments"] = json!(exported_segments);
        }
        manifest_notes.push(note);
    }
    let manifest = json!({
        "items": items,
        "notes": manifest_notes,
        "totalNotes": context.notes.len(),
        "nextOffset": Value::Null,
        "scope": "prepared-study-context",
    });
    crate::storage::atomic_write_with(&destination.join("manifest.json"), None, |writer| {
        serde_json::to_writer_pretty(writer, &manifest).map_err(std::io::Error::other)
    })
}

#[cfg(test)]
#[path = "../../test/study_context.rs"]
mod tests;
