use super::{library::Library, offset, required_note, text};
use serde_json::{json, Value};
use std::path::Path;

pub(super) fn excerpt(contents: &str, offset: usize, limit: usize) -> Value {
    let total = contents.chars().count();
    let excerpt: String = contents.chars().skip(offset).take(limit).collect();
    let end = offset.saturating_add(excerpt.chars().count());
    json!({"text":excerpt,"totalCharacters":total,"nextOffset":(end < total).then_some(end)})
}
fn read_result(note: &crate::notes::StudyNote, args: &Value, limit: usize) -> Value {
    let mut result = excerpt(&text(note), offset(args), limit);
    result["id"] = json!(note.id);
    result["title"] = json!(note.title);
    result["reference"] = json!(super::reference(&note.id));
    result["updatedAt"] = json!(note.updated_at);
    result["revision"] = json!(super::linking::revision(note).ok());
    result
}
pub(super) fn read_one(directory: &Path, args: &Value) -> Result<Value, String> {
    let note = required_note(directory, args, "noteId")?;
    Ok(read_result(
        &note,
        args,
        args["limit"].as_u64().unwrap_or(16000) as usize,
    ))
}
pub(super) fn read_many(directory: &Path, args: &Value) -> Result<Value, String> {
    let mut results = Vec::new();
    let mut errors = Vec::new();
    let limit = args["limit"].as_u64().unwrap_or(4000) as usize;
    for id in args["noteIds"].as_array().ok_or("AI_INVALID_ARGUMENTS")? {
        match required_note(directory, &json!({"noteId":id}), "noteId") {
            Ok(note) => results.push(read_result(&note, args, limit)),
            Err(error) => errors.push(json!({"id":id,"error":error})),
        }
    }
    Ok(json!({"notes":results,"errors":errors}))
}
fn match_offset(contents: &str, query: &str) -> Option<usize> {
    let byte = contents.to_lowercase().find(query)?;
    let mut folded_bytes = 0;
    for (index, character) in contents.chars().enumerate() {
        if folded_bytes >= byte {
            return Some(index);
        }
        folded_bytes += character.to_lowercase().map(char::len_utf8).sum::<usize>();
        if folded_bytes > byte {
            return Some(index);
        }
    }
    Some(contents.chars().count())
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
    let library = Library::load(directory)?;
    let mut matches = Vec::new();
    let mut total = 0usize;
    let offset = offset(args);
    let limit = if search { 20 } else { 100 };
    for note in &library.notes {
        let contents = if search { text(note) } else { String::new() };
        let title_match = search && note.title.to_lowercase().contains(&query);
        let found = if search {
            match_offset(&contents, &query)
        } else {
            None
        };
        if search && !title_match && found.is_none() {
            continue;
        }
        if total >= offset && matches.len() < limit {
            let mut result = json!({"id":note.id,"title":note.title,"reference":super::reference(&note.id),"preview":note.preview});
            if search {
                let start = found.unwrap_or(0).saturating_sub(120);
                result["snippet"] =
                    json!(contents.chars().skip(start).take(600).collect::<String>());
                result["snippetOffset"] = json!(start);
                result["matchOffset"] = json!(found);
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
    let end = offset.saturating_add(matches.len());
    Ok(
        json!({"notes":matches,"total":total,"unreadableNotes":library.unreadable,"nextOffset":(end < total).then_some(end)}),
    )
}
