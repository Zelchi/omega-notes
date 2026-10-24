use super::{library::Library, offset, required_note, text};
use serde_json::{json, Value};
use std::path::Path;

pub(super) fn excerpt(contents: &str, offset: usize, limit: usize) -> Result<Value, String> {
    let total = contents.chars().count();
    if contents.trim().is_empty() {
        return Err("AI_CONTENT_EMPTY".into());
    }
    if offset >= total {
        return Err("AI_OFFSET_OUT_OF_RANGE".into());
    }
    let excerpt: String = contents.chars().skip(offset).take(limit).collect();
    let end = offset.saturating_add(excerpt.chars().count());
    Ok(json!({"text":excerpt,"totalCharacters":total,"nextOffset":(end < total).then_some(end)}))
}
fn read_result(
    note: &crate::notes::StudyNote,
    args: &Value,
    limit: usize,
) -> Result<Value, String> {
    let mut result = excerpt(&text(note), offset(args), limit)?;
    result["id"] = json!(note.id);
    result["title"] = json!(note.title);
    result["reference"] = json!(super::reference(&note.id));
    result["updatedAt"] = json!(note.updated_at);
    result["revision"] = json!(super::linking::revision(note).ok());
    Ok(result)
}
pub(super) fn read_one(directory: &Path, args: &Value) -> Result<Value, String> {
    let note = required_note(directory, args, "noteId")?;
    read_result(
        &note,
        args,
        args["limit"].as_u64().unwrap_or(16000) as usize,
    )
}
pub(super) fn read_many(directory: &Path, args: &Value) -> Result<Value, String> {
    let mut results = Vec::new();
    let mut errors = Vec::new();
    let limit = args["limit"].as_u64().unwrap_or(4000) as usize;
    for id in args["noteIds"].as_array().ok_or("AI_INVALID_ARGUMENTS")? {
        match required_note(directory, &json!({"noteId":id}), "noteId") {
            Ok(note) => match read_result(&note, args, limit) {
                Ok(result) => results.push(result),
                Err(error) => errors.push(json!({"id":id,"error":error})),
            },
            Err(error) => errors.push(json!({"id":id,"error":error})),
        }
    }
    Ok(json!({"notes":results,"errors":errors}))
}
pub(super) fn list(directory: &Path, args: &Value, search: bool) -> Result<Value, String> {
    let query = args["query"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if search && query.is_empty() {
        return Err("AI_INVALID_QUERY".into());
    }
    let library = if search {
        Library::load_for_search(directory)?
    } else {
        Library::load(directory)?
    };
    let search_matches = if search {
        super::search::with_index(directory, &library, |index: &super::search::SearchCache| {
            index.matching(&query)
        })?
    } else {
        Default::default()
    };
    let mut matches = Vec::new();
    let mut total = 0usize;
    let unreadable = library.unreadable;
    let offset = offset(args);
    let limit = if search { 20 } else { 100 };
    for note in &library.notes {
        let content_available = note.has_text;
        let title_match = search && note.title.to_lowercase().contains(&query);
        let found = if search {
            search_matches.get(&note.id)
        } else {
            None
        };
        if search && !title_match && found.is_none() {
            continue;
        }
        if total >= offset && matches.len() < limit {
            let mut result = json!({"id":note.id,"title":note.title,"reference":super::reference(&note.id),"contentAvailable":content_available});
            if search {
                if let Some(found) = found {
                    result["matchOffset"] = json!(found.match_offset);
                }
                result["matchedIn"] = json!(if title_match && found.is_some() {
                    "both"
                } else if title_match {
                    "title"
                } else {
                    "text"
                });
            }
            matches.push(result);
        }
        total += 1;
    }
    if offset > 0 && offset >= total {
        return Err("AI_OFFSET_OUT_OF_RANGE".into());
    }
    let end = offset.saturating_add(matches.len());
    let message = if total == 0 {
        Some(if search {
            "No notes match this search."
        } else {
            "The vault contains no readable notes."
        })
    } else {
        None
    };
    Ok(
        json!({"notes":matches,"total":total,"unreadableNotes":unreadable,
        "nextOffset":(end < total).then_some(end),"message":message}),
    )
}
