use std::collections::HashSet;
use std::path::Path;

pub(crate) fn content_stats(
    notes_directory: &Path,
) -> Result<super::super::models::NoteContentStats, String> {
    match crate::app::library::content_stats_from_index(notes_directory) {
        Ok(stats) => Ok(stats),
        Err(error) if error == "NOTE_STATS_INDEX_UNAVAILABLE" => {
            scan_content_stats(notes_directory)
        }
        Err(error) => Err(error),
    }
}

fn scan_content_stats(
    notes_directory: &Path,
) -> Result<super::super::models::NoteContentStats, String> {
    use super::super::document::image_ids_in_document;
    use super::super::models::NoteElement;
    use super::super::repository::{note_from_path, note_paths};

    let (paths, entry_errors) = note_paths(notes_directory)
        .map_err(|error| format!("Não foi possível ler as notas do vault: {error}"))?;
    if let Some(error) = entry_errors.first() {
        return Err(format!("Não foi possível ler uma nota do vault: {error}"));
    }
    let mut note_count = 0;
    let mut image_ids = HashSet::new();
    let mut character_count = 0;
    for path in paths {
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        note_count += 1;
        if let Ok(note) = note_from_path(&path) {
            character_count += note
                .document
                .elements
                .iter()
                .filter_map(|element| match element {
                    NoteElement::Text { text, .. } => Some(text.chars().count()),
                    _ => None,
                })
                .sum::<usize>();
            image_ids.extend(image_ids_in_document(&note.document));
        }
    }

    Ok(super::super::models::NoteContentStats {
        note_count,
        image_count: image_ids.len(),
        character_count,
    })
}
