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
