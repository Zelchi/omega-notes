use serde_json::{json, Value};

pub(crate) fn definitions() -> Value {
    let offset = json!({"type":"integer","minimum":0});
    let note_id = json!({"type":"string"});
    let tools = [
        ("read_study_context", "Read the host-prepared snapshot for the current study request only. Empty primary notes stop preparation as insufficient content. The manifest marks empty supporting sources as contentAvailable=false; never use them as evidence. Without sourceId, list 50 deduplicated sources per page with short sourceId values (N1, N2...), titles, segment/table counts and usedByItems; nextOffset continues the manifest. items provides itemId, primarySourceId and supportingSourceIds. With sourceId, inspect segments grouped by Markdown heading path (h1-h6); Markdown tables are separate intact segments, while image/audio/video elements are omitted. Segment metadata includes kind, headingPath and a short preview. Sources up to 8000 characters also include text; for larger sources select relevant segmentId values and read them with sourceId plus segmentId. segmentOffset paginates the segment index; offset/limit paginate segment text in Unicode characters (default/max 16000), with nextOffset. Empty or out-of-range reads return explicit errors. Read only available sources whose usedByItems includes the exercise number, reuse shared sources and cite the exact sourceId values (N1, N2...), never note UUIDs or links. Direct references are already resolved: do not rediscover connections or expand recursively. Aliases and segment IDs are request-local. Unavailable outside an active prepared study request.", json!({"sourceId":{"type":"string","pattern":"^N[1-9][0-9]*$"},"segmentId":{"type":"integer","minimum":1},"segmentOffset":offset,"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!([])),
        ("list_notes", "List notes in the authorized vault, up to 100 per page. Each result says whether textual content is available; contentAvailable=false means the title is the only information and cannot support factual claims. An empty vault returns a message; paginate with offset only when nextOffset is non-null.", json!({"offset":offset}), json!([])),
        ("search_notes", "Search titles and text in the authorized vault, up to 20 per page. Results state whether the note has text; contentAvailable=false means the title match cannot support factual claims. A snippet and snippetOffset are included only when text matched; a title-only match has no snippet. No matches include a message. Paginate only when nextOffset is non-null.", json!({"query":{"type":"string","minLength":1,"maxLength":1000},"offset":offset}), json!(["query"])),
        ("read_note", "Read a note's text in the authorized vault. Empty notes and offsets outside the text return explicit errors, never an empty successful page. offset and limit count Unicode characters. Defaults to 16000 characters; paginate with nextOffset.", json!({"noteId":note_id,"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!(["noteId"])),
        ("read_notes", "Read up to 8 distinct notes in one call. Returns per-note errors, including empty notes, without discarding successful reads. offset applies to each note; an empty note or out-of-range offset returns an error for that note. limit defaults to 4000 characters per note, maximum 4000. Continue truncated notes with read_note.", json!({"noteIds":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":8,"uniqueItems":true},"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":4000}}), json!(["noteIds"])),
        ("list_note_connections", "List unique linked notes with IDs, titles and incoming/outgoing flags. Incoming means other notes reference this note. Defaults to both directions, 100 per page. Ignores code, missing notes and self-links. unreadableNotes reports incomplete results.", json!({"noteId":note_id,"direction":{"type":"string","enum":["incoming","outgoing","both"]},"offset":offset}), json!(["noteId"])),
        ("get_vault_overview", "Summarize the authorized vault: readable notes, directed references, unique undirected connections, isolated notes and unresolved references. unreadableNotes reports incomplete results. Does not return note contents.", json!({}), json!([])),
        ("get_note_outline", "List a note's Markdown ATX headings (h1-h6), excluding fenced code, 100 per page. Each sectionId identifies one heading occurrence, including duplicates. A section includes its subheadings until the next heading of the same or higher level. sectionId 0 reads the introduction. Heading labels are capped at 600 characters with titleTruncated; read the section for full text. IDs can change after edits; fetch a fresh outline.", json!({"noteId":note_id,"offset":offset}), json!(["noteId"])),
        ("read_note_section", "Read one section using sectionId from get_note_outline; 0 means introduction. Includes the heading and nested sections. Empty sections and offsets outside the section return explicit errors, never empty successful pages. offset and limit are Unicode characters within that section, default/max 16000. IDs can change after edits.", json!({"noteId":note_id,"sectionId":{"type":"integer","minimum":0},"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!(["noteId","sectionId"])),
        ("get_note_segments", "Index a note's readable text into compact segments for targeted retrieval. Segments carry their h1-h6 heading path; Markdown tables are separate segments, fenced code is preserved, and image/audio/video elements are omitted. Each entry has a short preview and character count. Returns 100 per page; continue with offset only when nextOffset is non-null. Segment IDs are note-revision local; refresh this index after edits.", json!({"noteId":note_id,"offset":offset}), json!(["noteId"])),
        ("read_note_segment", "Read one text or Markdown table segment by segmentId from get_note_segments. The result includes its title and heading path. offset and limit count Unicode characters within that segment; defaults/max 16000. Empty segments and out-of-range offsets return explicit errors. Segment IDs are note-revision local; refresh the index after edits.", json!({"noteId":note_id,"segmentId":{"type":"integer","minimum":1},"offset":offset,"limit":{"type":"integer","minimum":1,"maximum":16000}}), json!(["noteId","segmentId"])),
        ("find_unresolved_links", "Find references to missing notes, excluding code and self-links. Returns source ID/title and the unresolved target, deduplicated per source. Optional noteId restricts the source note. unreadableNotes can make references appear missing. Paginate with offset, 100 per page. Targets are capped at 600 characters with targetTruncated; read the source note for full text.", json!({"noteId":note_id,"offset":offset}), json!([])),
        ("find_connection_path", "Find a shortest connection path between two note IDs in the authorized vault. Defaults to both directions (like the canvas); outgoing follows arrows only. maxDepth defaults to 12, maximum 32 links. depthLimited=true means a path may exist beyond the depth limit. unreadableNotes reports incomplete results.", json!({"sourceId":note_id,"targetId":note_id,"direction":{"type":"string","enum":["outgoing","both"]},"maxDepth":{"type":"integer","minimum":1,"maximum":32}}), json!(["sourceId","targetId"])),
        ("link_note_mentions", "Manage internal links in ONE authorized-vault note only on explicit user request. operation defaults to link: insert links around existing prose. operation unlink: remove only the wrappers of exact existing [[id]] or [[id|label]] references, preserving their current display text; use this to undo links without reverting subsequent edits. Before unlinking reread the current note, identify only links from the requested operation, preserve pre-existing or later user-created links, and ask if ambiguous. For unlink, mentions.text must be the entire current reference and targetId its exact ID. Never restore old note contents. For analysis/suggestions alone do not call this tool. First read_note and inspect candidate notes for semantic relevance; never link merely because names match. Pass revision from read_note and up to 100 non-overlapping mentions using zero-based Unicode character offsets in the full read_note text, not snippet-relative offsets. end is exclusive; text must exactly match that span. Targets must be existing notes in this vault. Self-references to the source note are allowed. Uses [[targetId]] when text exactly equals the current target title (case-sensitive); otherwise preserves the original visible text with [[targetId|text]]. It refuses stale revisions and code. Link insertion also refuses partial words, existing links and URLs; unlink only accepts entire internal references outside code. The app applies and saves the change; a conflict requires rereading and reanalysis, never retrying old offsets blindly. No other text, titles or media may be edited. Returns applied references or an error.", json!({"noteId":note_id,"revision":{"type":"string","minLength":16,"maxLength":16},"operation":{"type":"string","enum":["link","unlink"]},"mentions":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","additionalProperties":false,"required":["start","end","text","targetId"],"properties":{"start":offset,"end":{"type":"integer","minimum":1},"text":{"type":"string","minLength":1,"maxLength":1000},"targetId":note_id}}}}), json!(["noteId","revision","mentions"])),
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
    if valid(schema, args) {
        Ok(())
    } else {
        Err("AI_INVALID_ARGUMENTS".into())
    }
}

fn valid(rule: &Value, value: &Value) -> bool {
    let valid_type = match rule["type"].as_str() {
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
                    valid(&rule["items"], item)
                        && (rule["uniqueItems"] != true || !items[..index].contains(item))
                })
        }),
        Some("object") => value.as_object().is_some_and(|object| {
            let Some(properties) = rule["properties"].as_object() else {
                return false;
            };
            rule["required"].as_array().is_none_or(|keys| {
                keys.iter()
                    .all(|key| object.contains_key(key.as_str().unwrap_or_default()))
            }) && object.iter().all(|(key, value)| {
                properties
                    .get(key)
                    .is_some_and(|schema| valid(schema, value))
            })
        }),
        _ => false,
    };
    valid_type
        && rule["pattern"].as_str().is_none_or(|pattern| {
            value
                .as_str()
                .is_some_and(|text| matches_pattern(pattern, text))
        })
        && rule["enum"]
            .as_array()
            .is_none_or(|allowed| allowed.contains(value))
}

fn matches_pattern(pattern: &str, text: &str) -> bool {
    match pattern {
        "^N[1-9][0-9]*$" => {
            let bytes = text.as_bytes();
            bytes.len() >= 2
                && bytes[0] == b'N'
                && (b'1'..=b'9').contains(&bytes[1])
                && bytes[2..].iter().all(u8::is_ascii_digit)
        }
        _ => false,
    }
}
