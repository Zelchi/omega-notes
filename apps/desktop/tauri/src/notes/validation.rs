use crate::names::normalize_name;

use super::models::StudyNote;

pub(crate) fn validate_note_id(note_id: &str) -> Result<(), String> {
    if note_id.is_empty()
        || !note_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Identificador de nota inválido.".to_string());
    }
    Ok(())
}

pub(crate) fn validate_note_title(title: &str) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("EMPTY_TITLE".to_string());
    }
    Ok(())
}

pub(crate) fn ensure_unique_note_title(
    notes: &[StudyNote],
    title: &str,
    excluded_id: Option<&str>,
) -> Result<(), String> {
    let normalized = normalize_name(title);
    if notes.iter().any(|note| {
        Some(note.id.as_str()) != excluded_id && normalize_name(&note.title) == normalized
    }) {
        return Err("DUPLICATE_TITLE".to_string());
    }
    Ok(())
}
