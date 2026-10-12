use std::collections::HashMap;

use super::models::{NoteDocument, NoteElement, StudyNote};
use crate::names::normalize_name;

pub(crate) fn note_title_indexes(
    notes: &[StudyNote],
) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut by_id = HashMap::new();
    for note in notes {
        by_id.insert(normalize_name(&note.id), note.id.clone());
    }

    let mut stable_notes = notes.iter().collect::<Vec<_>>();
    stable_notes.sort_by(|first, second| first.id.cmp(&second.id));
    let mut by_title = HashMap::new();
    for note in stable_notes {
        let key = normalize_name(&note.title);
        if !key.is_empty() {
            by_title.entry(key).or_insert_with(|| note.id.clone());
        }
    }
    (by_id, by_title)
}

fn rewrite_resolved_text_links(
    content: &str,
    previous_title: &str,
    next_title: &str,
    renamed_id: &str,
    notes_by_id: &HashMap<String, String>,
    notes_by_title: &HashMap<String, String>,
) -> String {
    let previous_key = normalize_name(previous_title);
    let mut rewritten = String::with_capacity(content.len());
    let mut cursor = 0;

    while let Some(relative_start) = content[cursor..].find("[[") {
        let start = cursor + relative_start;
        rewritten.push_str(&content[cursor..start]);
        let target_start = start + 2;
        let Some(relative_end) = content[target_start..].find("]]") else {
            rewritten.push_str(&content[start..]);
            return rewritten;
        };
        let end = target_start + relative_end;
        let body = &content[target_start..end];
        let separator = body.find('|').unwrap_or(body.len());
        let target = body[..separator].trim();
        let target_key = normalize_name(target);
        let explicit_id = notes_by_id.contains_key(&target_key);
        let resolved_id = notes_by_id
            .get(&target_key)
            .or_else(|| notes_by_title.get(&target_key));

        if target_key == previous_key
            && !explicit_id
            && resolved_id.is_some_and(|id| id == renamed_id)
        {
            rewritten.push_str("[[");
            rewritten.push_str(next_title);
            rewritten.push_str(&body[separator..]);
            rewritten.push_str("]]");
        } else {
            rewritten.push_str(&content[start..end + 2]);
        }
        cursor = end + 2;
    }

    rewritten.push_str(&content[cursor..]);
    rewritten
}

pub(crate) fn rename_resolved_note_links(
    document: &NoteDocument,
    previous_title: &str,
    next_title: &str,
    renamed_id: &str,
    notes_by_id: &HashMap<String, String>,
    notes_by_title: &HashMap<String, String>,
) -> (NoteDocument, bool) {
    let previous_key = normalize_name(previous_title);
    if notes_by_title.get(&previous_key).map(String::as_str) != Some(renamed_id) {
        return (document.clone(), false);
    }

    let mut updated = document.clone();
    let mut changed = false;
    for element in &mut updated.elements {
        if let NoteElement::Text { text, .. } = element {
            let rewritten = rewrite_resolved_text_links(
                text,
                previous_title,
                next_title,
                renamed_id,
                notes_by_id,
                notes_by_title,
            );
            if *text != rewritten {
                *text = rewritten;
                changed = true;
            }
        }
    }
    (updated, changed)
}
