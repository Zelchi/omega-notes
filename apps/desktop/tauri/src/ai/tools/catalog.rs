use serde_json::{json, Value};

pub(crate) fn definitions() -> Value {
    let offset = json!({"type":"integer","minimum":0});
    let note_id = json!({"type":"string"});
    let tools = [
        ("list_notes", "List notes in the authorized vault, up to 100 per page. Paginate with offset.", json!({"offset":offset}), json!([])),
        ("search_notes", "Search titles and text in the authorized vault, up to 20 per page. snippet shows matching text; snippetOffset is its character offset for read_note. Paginate with offset.", json!({"query":{"type":"string","minLength":1,"maxLength":1000},"offset":offset}), json!(["query"])),
        ("read_note", "Read a note's text in the authorized vault. offset and limit count Unicode characters. Defaults to 16000 characters; paginate with nextOffset.", json!({"noteId":note_id,"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!(["noteId"])),
        ("read_notes", "Read up to 8 distinct notes in one call. Returns per-note errors without discarding successful reads. offset applies to each note; limit defaults to 4000 characters per note, maximum 4000. Continue truncated notes with read_note.", json!({"noteIds":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":8,"uniqueItems":true},"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":4000}}), json!(["noteIds"])),
        ("list_note_connections", "List unique linked notes with IDs, titles and incoming/outgoing flags. Incoming means other notes reference this note. Defaults to both directions, 100 per page. Ignores code, missing notes and self-links. unreadableNotes reports incomplete results.", json!({"noteId":note_id,"direction":{"type":"string","enum":["incoming","outgoing","both"]},"offset":offset}), json!(["noteId"])),
        ("get_vault_overview", "Summarize the authorized vault: readable notes, directed references, unique undirected connections, isolated notes and unresolved references. unreadableNotes reports incomplete results. Does not return note contents.", json!({}), json!([])),
        ("get_note_outline", "List a note's Markdown ATX headings (h1-h6), excluding fenced code, 100 per page. Each sectionId identifies one heading occurrence, including duplicates. A section includes its subheadings until the next heading of the same or higher level. sectionId 0 reads the introduction. Heading labels are capped at 600 characters with titleTruncated; read the section for full text. IDs can change after edits; fetch a fresh outline.", json!({"noteId":note_id,"offset":offset}), json!(["noteId"])),
        ("read_note_section", "Read one section using sectionId from get_note_outline; 0 means introduction. Includes the heading and nested sections. offset and limit are Unicode characters within that section, default/max 16000. IDs can change after edits.", json!({"noteId":note_id,"sectionId":{"type":"integer","minimum":0},"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!(["noteId","sectionId"])),
        ("find_unresolved_links", "Find references to missing notes, excluding code and self-links. Returns source ID/title and the unresolved target, deduplicated per source. Optional noteId restricts the source note. unreadableNotes can make references appear missing. Paginate with offset, 100 per page. Targets are capped at 600 characters with targetTruncated; read the source note for full text.", json!({"noteId":note_id,"offset":offset}), json!([])),
        ("find_connection_path", "Find a shortest connection path between two note IDs in the authorized vault. Defaults to both directions (like the canvas); outgoing follows arrows only. maxDepth defaults to 12, maximum 32 links. depthLimited=true means a path may exist beyond the depth limit. unreadableNotes reports incomplete results.", json!({"sourceId":note_id,"targetId":note_id,"direction":{"type":"string","enum":["outgoing","both"]},"maxDepth":{"type":"integer","minimum":1,"maximum":32}}), json!(["sourceId","targetId"])),
    ];
    Value::Array(tools.into_iter().map(|(name, description, properties, required)| json!({
        "type":"function","name":name,"description":format!("{description} When mentioning an existing note, copy its reference field (or sourceReference for an unresolved link source) into your reply as a clickable [[id]] link. Never cite only the plain or bold title."),
        "inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false}
    })).collect())
}

pub(crate) fn names() -> Vec<String> {
    definitions()
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_string())
        .collect()
}

pub(super) fn validate(schema: &Value, args: &Value) -> Result<(), String> {
    let args = args.as_object().ok_or("AI_INVALID_ARGUMENTS")?;
    let properties = schema["properties"]
        .as_object()
        .ok_or("AI_INVALID_ARGUMENTS")?;
    if schema["required"].as_array().is_some_and(|keys| {
        keys.iter()
            .any(|key| !args.contains_key(key.as_str().unwrap_or_default()))
    }) {
        return Err("AI_INVALID_ARGUMENTS".into());
    }
    for (name, value) in args {
        let rule = properties.get(name).ok_or("AI_INVALID_ARGUMENTS")?;
        let valid = match rule["type"].as_str() {
            Some("string") => value.as_str().is_some_and(|text| {
                let length = text.chars().count() as u64;
                rule["minLength"].as_u64().is_none_or(|min| length >= min)
                    && rule["maxLength"].as_u64().is_none_or(|max| length <= max)
            }),
            Some("integer") => value.as_u64().is_some_and(|number| {
                rule["minimum"].as_u64().is_none_or(|min| number >= min)
                    && rule["maximum"].as_u64().is_none_or(|max| number <= max)
            }),
            Some("array") => value.as_array().is_some_and(|items| {
                items.len() >= rule["minItems"].as_u64().unwrap_or(0) as usize
                    && items.len() <= rule["maxItems"].as_u64().unwrap_or(u64::MAX) as usize
                    && items.iter().enumerate().all(|(index, item)| {
                        item.is_string()
                            && (rule["uniqueItems"] != true || !items[..index].contains(item))
                    })
            }),
            _ => false,
        };
        if !valid
            || rule["enum"]
                .as_array()
                .is_some_and(|allowed| !allowed.contains(value))
        {
            return Err("AI_INVALID_ARGUMENTS".into());
        }
    }
    Ok(())
}
