use crate::names::normalize_name;
use std::path::Path;

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

pub(crate) fn ensure_unique_note_title_in_directory(
    directory: &Path,
    title: &str,
    excluded_id: Option<&str>,
) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct NoteTitleProjection {
        format: String,
        version: u8,
        id: String,
        title: String,
        document: serde::de::IgnoredAny,
    }

    let normalized_title = normalize_name(title);
    let entries = std::fs::read_dir(directory).map_err(|_| "NOTE_TITLE_CHECK_FAILED")?;
    for entry in entries {
        let entry = entry.map_err(|_| "NOTE_TITLE_CHECK_FAILED")?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| "NOTE_TITLE_CHECK_FAILED")?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("NOTE_TITLE_CHECK_FAILED".into());
        }
        let id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or("NOTE_TITLE_CHECK_FAILED")?;
        if Some(id) == excluded_id {
            continue;
        }
        let note: NoteTitleProjection = serde_json::from_reader(
            std::fs::File::open(&path).map_err(|_| "NOTE_TITLE_CHECK_FAILED")?,
        )
        .map_err(|_| "NOTE_TITLE_CHECK_FAILED")?;
        let _ = note.document;
        if note.format != "omega-page" || note.version != 2 || note.id != id {
            return Err("NOTE_TITLE_CHECK_FAILED".into());
        }
        validate_note_title(&note.title).map_err(|_| "NOTE_TITLE_CHECK_FAILED")?;
        if normalize_name(&note.title) == normalized_title {
            return Err("DUPLICATE_TITLE".into());
        }
    }
    Ok(())
}
