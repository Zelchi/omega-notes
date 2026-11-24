use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    time::UNIX_EPOCH,
};

pub(super) const SUMMARY_INDEX_FILE: &str = ".note-summaries.json";
pub(super) const SUMMARY_INDEX_VERSION: u8 = 7;
const SUMMARY_INDEX_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileStamp {
    pub(super) path: String,
    pub(super) length: u64,
    pub(super) modified_nanos: u128,
    #[serde(default)]
    pub(super) identity: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SummaryEntry {
    pub(super) file_name: String,
    pub(super) stamp: FileStamp,
    pub(super) summary: Option<crate::notes::NoteSummary>,
    #[serde(default)]
    pub(super) content_stats: Option<IndexedContentStats>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IndexedContentStats {
    pub(super) character_count: usize,
    pub(super) image_ids: Vec<String>,
    #[serde(default)]
    pub(super) audio_ids: Vec<String>,
    #[serde(default)]
    pub(super) video_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SummaryIndex {
    pub(super) version: u8,
    pub(super) entries: Vec<SummaryEntry>,
}

pub(super) fn read_summary_index(directory: &Path) -> Option<SummaryIndex> {
    let path = directory.join(SUMMARY_INDEX_FILE);
    let metadata = fs::symlink_metadata(&path).ok()?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > SUMMARY_INDEX_MAX_BYTES
    {
        return None;
    }
    let index: SummaryIndex = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if index.version != SUMMARY_INDEX_VERSION {
        return None;
    }
    let mut filenames = HashSet::new();
    for entry in &index.entries {
        let id = entry.file_name.strip_suffix(".omega")?;
        if crate::notes::validate_note_id(id).is_err()
            || entry.stamp.path != entry.file_name
            || !filenames.insert(entry.file_name.as_str())
            || entry.summary.as_ref().is_some_and(|summary| {
                summary.id != id || summary.links.iter().any(|link| link.trim().is_empty())
            })
            || entry.summary.is_some() != entry.content_stats.is_some()
        {
            return None;
        }
    }
    Some(index)
}

pub(super) fn write_summary_index(directory: &Path, index: &SummaryIndex) -> Result<(), String> {
    let bytes = serde_json::to_vec(index).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > SUMMARY_INDEX_MAX_BYTES {
        return Err("Índice de resumos excede o limite permitido.".into());
    }
    crate::storage::atomic_write(&directory.join(SUMMARY_INDEX_FILE), &bytes, None)
}

pub(super) fn file_stamp(path: &Path) -> Result<Option<FileStamp>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Não foi possível verificar o arquivo: {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Arquivo de nota não é um arquivo regular seguro.".into());
    }
    let modified_nanos = metadata
        .modified()
        .map_err(|error| format!("Não foi possível verificar a data do arquivo: {error}"))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Data de arquivo inválida: {error}"))?
        .as_nanos();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    #[cfg(unix)]
    let identity = {
        use std::os::unix::fs::MetadataExt;
        Some(format!("{}:{}", metadata.dev(), metadata.ino()))
    };
    #[cfg(not(unix))]
    let identity = None;
    Ok(Some(FileStamp {
        path: file_name.to_string(),
        length: metadata.len(),
        modified_nanos,
        identity,
    }))
}

pub(super) fn indexed_content_stats(note: &crate::notes::StudyNote) -> IndexedContentStats {
    let character_count = note
        .document
        .elements
        .iter()
        .filter_map(|element| match element {
            crate::notes::NoteElement::Text { text, .. } => Some(text.chars().count()),
            _ => None,
        })
        .sum();
    let mut image_ids = crate::notes::image_ids_in_document(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    image_ids.sort();
    let mut audio_ids = crate::notes::audio_ids_in_document(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    audio_ids.sort();
    let mut video_ids = crate::notes::video_ids_in_document(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    video_ids.sort();
    IndexedContentStats {
        character_count,
        image_ids,
        audio_ids,
        video_ids,
    }
}

pub(crate) fn content_stats_from_index(
    directory: &Path,
) -> Result<crate::notes::NoteContentStats, String> {
    let (paths, entry_errors) = crate::notes::note_paths(directory)
        .map_err(|error| format!("Não foi possível ler as notas do vault: {error}"))?;
    if let Some(error) = entry_errors.first() {
        return Err(format!("Não foi possível ler uma nota do vault: {error}"));
    }
    let index = read_summary_index(directory).ok_or("NOTE_STATS_INDEX_UNAVAILABLE")?;
    let indexed = index
        .entries
        .iter()
        .map(|entry| (entry.file_name.as_str(), entry.content_stats.as_ref()))
        .collect::<HashMap<_, _>>();
    let mut note_count = 0;
    let mut image_ids = HashSet::new();
    let mut audio_ids = HashSet::new();
    let mut video_ids = HashSet::new();
    let mut character_count = 0_usize;
    for path in paths
        .iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("omega"))
    {
        note_count += 1;
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(Some(stats)) = indexed.get(file_name) else {
            continue;
        };
        character_count = character_count.saturating_add(stats.character_count);
        image_ids.extend(stats.image_ids.iter().cloned());
        audio_ids.extend(stats.audio_ids.iter().cloned());
        video_ids.extend(stats.video_ids.iter().cloned());
    }
    Ok(crate::notes::NoteContentStats {
        note_count,
        image_count: image_ids.len(),
        audio_count: audio_ids.len(),
        video_count: video_ids.len(),
        character_count,
    })
}

pub(crate) fn update_cached_note_summaries(directory: &Path, notes: &[crate::notes::StudyNote]) {
    let Some(mut index) = read_summary_index(directory) else {
        return;
    };
    for note in notes {
        let path = crate::notes::note_path(directory, &note.id);
        let Ok(Some(stamp)) = file_stamp(&path) else {
            continue;
        };
        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        index.entries.retain(|entry| entry.file_name != file_name);
        index.entries.push(SummaryEntry {
            file_name,
            stamp,
            summary: Some(summary_from_note(note.clone())),
            content_stats: Some(indexed_content_stats(note)),
        });
    }
    index
        .entries
        .sort_by(|first, second| first.file_name.cmp(&second.file_name));
    let _ = write_summary_index(directory, &index);
}

pub(crate) fn remove_cached_note_summary(directory: &Path, note_id: &str) {
    let Some(mut index) = read_summary_index(directory) else {
        return;
    };
    index.entries.retain(|entry| {
        entry
            .summary
            .as_ref()
            .is_none_or(|summary| summary.id != note_id)
    });
    let _ = write_summary_index(directory, &index);
}

pub(super) fn summary_from_note(note: crate::notes::StudyNote) -> crate::notes::NoteSummary {
    let mut links = crate::notes::note_reference_targets(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    links.sort();
    let has_content = note.document.elements.iter().any(|element| match element {
        crate::notes::NoteElement::Text { text, .. } => !text.trim().is_empty(),
        _ => true,
    });
    let has_text = note.document.elements.iter().any(|element| match element {
        crate::notes::NoteElement::Text { text, .. } => !text.trim().is_empty(),
        _ => false,
    });
    let study_text = note
        .document
        .elements
        .iter()
        .filter_map(|element| match element {
            crate::notes::NoteElement::Text { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
    let study_content_characters = study_text.chars().count();
    let study_content_words = study_text
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .count();
    let study_content_lines = study_text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.chars().count().saturating_add(79) / 80)
        .sum();
    crate::notes::NoteSummary {
        id: note.id,
        title: note.title,
        updated_at: note.updated_at,
        links,
        has_content,
        has_text,
        study_content_characters,
        study_content_words,
        study_content_lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn index_keeps_version_seven_and_camel_case_disk_format() {
        let directory = tempfile::tempdir().unwrap();
        let id = uuid::Uuid::now_v7().to_string();
        let name = format!("{id}.omega");
        let index = SummaryIndex {
            version: SUMMARY_INDEX_VERSION,
            entries: vec![SummaryEntry {
                file_name: name.clone(),
                stamp: FileStamp {
                    path: name.clone(),
                    length: 12,
                    modified_nanos: 34,
                    identity: None,
                },
                summary: None,
                content_stats: None,
            }],
        };
        write_summary_index(directory.path(), &index).unwrap();
        let serialized: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.path().join(SUMMARY_INDEX_FILE)).unwrap())
                .unwrap();
        assert_eq!(
            serialized,
            json!({
                "version": 7,
                "entries": [{
                    "fileName": name,
                    "stamp": { "path": name, "length": 12, "modifiedNanos": 34, "identity": null },
                    "summary": null,
                    "contentStats": null
                }]
            })
        );
        assert!(read_summary_index(directory.path()).is_some());
    }

    #[test]
    fn invalid_entries_are_rejected_and_older_optional_fields_still_decode() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SUMMARY_INDEX_FILE);
        let name = format!("{}.omega", uuid::Uuid::now_v7());
        let entry = json!({
            "fileName": name,
            "stamp": { "path": name, "length": 12, "modifiedNanos": 34 },
            "summary": null
        });
        let write = |entries: serde_json::Value| {
            fs::write(
                &path,
                serde_json::to_vec(&json!({ "version": 7, "entries": entries })).unwrap(),
            )
            .unwrap();
        };
        write(json!([entry]));
        assert!(read_summary_index(directory.path()).is_some());

        write(json!([entry, entry]));
        assert!(read_summary_index(directory.path()).is_none());
        let mut wrong_path = entry.clone();
        wrong_path["stamp"]["path"] = json!("different.omega");
        write(json!([wrong_path]));
        assert!(read_summary_index(directory.path()).is_none());
        let mut mismatched_stats = entry;
        mismatched_stats["contentStats"] = json!({ "characterCount": 0, "imageIds": [] });
        write(json!([mismatched_stats]));
        assert!(read_summary_index(directory.path()).is_none());
    }

    #[test]
    fn oversized_index_is_ignored() {
        let directory = tempfile::tempdir().unwrap();
        let file = fs::File::create(directory.path().join(SUMMARY_INDEX_FILE)).unwrap();
        file.set_len(SUMMARY_INDEX_MAX_BYTES + 1).unwrap();
        assert!(read_summary_index(directory.path()).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_accepted_as_index_or_note_stamp() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("target");
        fs::write(&target, br#"{"version":7,"entries":[]}"#).unwrap();
        symlink(&target, directory.path().join(SUMMARY_INDEX_FILE)).unwrap();
        assert!(read_summary_index(directory.path()).is_none());
        assert!(file_stamp(&directory.path().join(SUMMARY_INDEX_FILE)).is_err());
    }
}
