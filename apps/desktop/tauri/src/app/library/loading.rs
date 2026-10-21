use crate::names::normalize_name;
use serde::{Deserialize, Serialize};
use std::{
    cmp::Reverse,
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::notes::{
    note_backup_path, note_file_exists, note_from_path, note_from_path_with_id,
    note_id_from_backup, note_path, note_paths, preserve_recovery_copy, read_file_bytes,
    restore_file, NoteLibrary, NoteLoadIssue,
};

const SUMMARY_INDEX_FILE: &str = ".note-summaries.json";
const SUMMARY_INDEX_VERSION: u8 = 3;
const SUMMARY_INDEX_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStamp {
    path: String,
    length: u64,
    modified_nanos: u128,
    #[serde(default)]
    identity: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryEntry {
    file_name: String,
    stamp: FileStamp,
    summary: Option<crate::notes::NoteSummary>,
    #[serde(default)]
    content_stats: Option<IndexedContentStats>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedContentStats {
    character_count: usize,
    image_ids: Vec<String>,
    audio_ids: Vec<String>,
    video_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryIndex {
    version: u8,
    entries: Vec<SummaryEntry>,
}

pub(crate) fn list_notes(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
) -> Result<NoteLibrary, String> {
    let mut notes = Vec::new();
    let (issues, reference_titles) = visit_notes(resolve_directories, &mut |note| {
        notes.push(note);
        Ok(())
    })?;
    notes.sort_by_key(|note| Reverse(note.updated_at));
    Ok(NoteLibrary {
        notes,
        issues,
        reference_titles,
    })
}

pub(crate) fn stream_note_summaries(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    mut emit: impl FnMut(crate::notes::NoteSummary) -> Result<(), String>,
) -> Result<
    (
        Vec<NoteLoadIssue>,
        std::collections::HashMap<String, String>,
    ),
    String,
> {
    stream_note_summaries_internal(resolve_directories, false, |summary, _| emit(summary))
}

pub(crate) fn stream_note_summaries_with_text(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    emit: impl FnMut(crate::notes::NoteSummary, Option<String>) -> Result<(), String>,
) -> Result<
    (
        Vec<NoteLoadIssue>,
        std::collections::HashMap<String, String>,
    ),
    String,
> {
    stream_note_summaries_internal(resolve_directories, true, emit)
}

fn stream_note_summaries_internal(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    include_search_text: bool,
    mut emit: impl FnMut(crate::notes::NoteSummary, Option<String>) -> Result<(), String>,
) -> Result<
    (
        Vec<NoteLoadIssue>,
        std::collections::HashMap<String, String>,
    ),
    String,
> {
    let (directory, backups_directory) = resolve_directories()?;
    crate::notes::recover_note_rename_journal(&directory, &backups_directory)?;

    let mut issues = Vec::new();
    let mut entries = Vec::new();
    let mut active_ids = HashSet::new();
    let cached = read_summary_index(&directory)
        .map(|index| {
            index
                .entries
                .into_iter()
                .map(|entry| (entry.file_name.clone(), entry))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();
    let (paths, entry_errors) = match note_paths(&directory) {
        Ok(entries) => entries,
        Err(error) => {
            return Ok((
                vec![NoteLoadIssue {
                    file_name: "notes".to_string(),
                    message: format!("Não foi possível abrir a biblioteca: {error}"),
                    recovery_path: None,
                    recovered: false,
                }],
                Default::default(),
            ));
        }
    };
    for error in entry_errors {
        issues.push(NoteLoadIssue {
            file_name: "notes".to_string(),
            message: format!("Não foi possível ler uma entrada da biblioteca: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }

    for path in paths
        .iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("omega"))
    {
        let Some(file_name) = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
        else {
            issues.push(summary_issue("notes", "Nome de arquivo de nota inválido."));
            continue;
        };
        let Some(note_id) = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
        else {
            issues.push(summary_issue(&file_name, "Identificador de nota inválido."));
            continue;
        };
        active_ids.insert(note_id.clone());
        if crate::notes::validate_note_id(&note_id).is_err() {
            issues.push(summary_issue(&file_name, "Identificador de nota inválido."));
            continue;
        }
        let stamp = match file_stamp(path) {
            Ok(Some(stamp)) => stamp,
            Ok(None) => continue,
            Err(error) => {
                issues.push(summary_issue(&file_name, &error));
                continue;
            }
        };
        if let Some(previous) = cached
            .get(&file_name)
            .filter(|entry| entry.stamp == stamp && entry.summary.is_some())
        {
            emit(previous.summary.as_ref().unwrap().clone(), None)?;
            entries.push(previous.clone());
            continue;
        }

        let loaded = load_changed_note(
            path,
            &backups_directory,
            &note_id,
            include_search_text,
            &mut issues,
        )?;
        let summary = loaded.summary;
        let Some(refreshed_stamp) = file_stamp(path)? else {
            continue;
        };
        if refreshed_stamp != stamp {
            if let Some(summary) = &summary {
                emit(summary.clone(), loaded.search_text)?;
            }
            continue;
        }
        let entry = SummaryEntry {
            file_name,
            stamp: refreshed_stamp,
            summary,
            content_stats: loaded.content_stats,
        };
        if let Some(summary) = &entry.summary {
            emit(summary.clone(), loaded.search_text)?;
        }
        entries.push(entry);
    }

    let (backup_paths, backup_errors) = collect_backup_paths(&backups_directory)?;
    for error in backup_errors {
        issues.push(NoteLoadIssue {
            file_name: ".temp".to_string(),
            message: format!("Não foi possível ler uma entrada de arquivo temporário: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }
    let archive = crate::notes::deleted_notes_directory(&directory);
    for backup in backup_paths {
        let Some(note_id) = note_id_from_backup(&backup) else {
            continue;
        };
        if active_ids.contains(note_id) || archived_note_exists(&archive, note_id) {
            continue;
        }
        if crate::notes::validate_note_id(note_id).is_err() {
            issues.push(summary_issue(
                ".temp",
                "Identificador de nota temporária inválido.",
            ));
            continue;
        }
        match note_from_path_with_id(&backup, note_id) {
            Ok(note) => {
                match read_file_bytes(&backup) {
                    Ok(bytes) => {
                        let active_path = note_path(&directory, note_id);
                        match restore_file(&active_path, &bytes) {
                        Ok(()) => {
                            let content_stats = indexed_content_stats(&note);
                            let search_text = include_search_text.then(|| note_text(&note));
                            let summary = summary_from_note(note);
                            emit(summary.clone(), search_text)?;
                            issues.push(NoteLoadIssue {
                                file_name: active_path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                                message: "Uma gravação foi interrompida; a cópia anterior foi restaurada.".to_string(),
                                recovery_path: None,
                                recovered: true,
                            });
                            if let Some(stamp) = file_stamp(&active_path)? {
                                entries.push(SummaryEntry {
                                    file_name: active_path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                                    stamp,
                                    summary: Some(summary),
                                    content_stats: Some(content_stats),
                                });
                            }
                        }
                        Err(error) => issues.push(NoteLoadIssue {
                            file_name: backup.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                            message: format!("A cópia anterior é válida, mas não pôde ser restaurada: {error}"),
                            recovery_path: preserve_recovery_copy(&backup, &backups_directory).ok().map(|path| path.to_string_lossy().into_owned()),
                            recovered: false,
                        }),
                    }
                    }
                    Err(error) => issues.push(NoteLoadIssue {
                        file_name: backup
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned(),
                        message: format!("Não foi possível ler a cópia anterior: {error}"),
                        recovery_path: preserve_recovery_copy(&backup, &backups_directory)
                            .ok()
                            .map(|path| path.to_string_lossy().into_owned()),
                        recovered: false,
                    }),
                }
            }
            Err(error) => issues.push(NoteLoadIssue {
                file_name: backup
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                message: format!("A cópia anterior também está inválida: {error}"),
                recovery_path: preserve_recovery_copy(&backup, &backups_directory)
                    .ok()
                    .map(|path| path.to_string_lossy().into_owned()),
                recovered: false,
            }),
        }
    }

    entries.sort_by(|first, second| first.file_name.cmp(&second.file_name));
    let index = SummaryIndex {
        version: SUMMARY_INDEX_VERSION,
        entries,
    };
    let _ = write_summary_index(&directory, &index);
    let (reference_titles, title_issues) = crate::notes::load_reference_titles(&directory);
    issues.extend(title_issues);
    Ok((issues, reference_titles))
}

struct LoadedNoteSummary {
    summary: Option<crate::notes::NoteSummary>,
    content_stats: Option<IndexedContentStats>,
    search_text: Option<String>,
}

fn note_text(note: &crate::notes::StudyNote) -> String {
    note.document
        .elements
        .iter()
        .filter_map(|element| match element {
            crate::notes::NoteElement::Text { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn indexed_content_stats(note: &crate::notes::StudyNote) -> IndexedContentStats {
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
    let mut audio_ids = crate::notes::audio_ids_in_document(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    let mut video_ids = crate::notes::video_ids_in_document(&note.document)
        .into_iter()
        .collect::<Vec<_>>();
    image_ids.sort();
    audio_ids.sort();
    video_ids.sort();
    IndexedContentStats {
        character_count,
        image_ids,
        audio_ids,
        video_ids,
    }
}

pub(crate) fn ensure_unique_note_title(
    directory: &Path,
    backups_directory: &Path,
    title: &str,
    excluded_id: Option<&str>,
) -> Result<(), String> {
    let normalized = normalize_name(title);
    let mut duplicate = false;
    let (issues, _) = stream_note_summaries(
        &|| Ok((directory.to_path_buf(), backups_directory.to_path_buf())),
        |summary| {
            if Some(summary.id.as_str()) != excluded_id
                && normalize_name(&summary.title) == normalized
            {
                duplicate = true;
            }
            Ok(())
        },
    )?;
    if issues
        .iter()
        .any(|issue| issue.file_name == "notes" || issue.file_name.ends_with(".omega"))
    {
        return Err("NOTE_TITLE_CHECK_FAILED".into());
    }
    if duplicate {
        Err("DUPLICATE_TITLE".into())
    } else {
        Ok(())
    }
}

pub(crate) fn ensure_unique_note_title_in_summaries(
    summaries: &[crate::notes::NoteSummary],
    normalized_title: &str,
    excluded_id: Option<&str>,
) -> Result<(), String> {
    if summaries.iter().any(|summary| {
        Some(summary.id.as_str()) != excluded_id
            && normalize_name(&summary.title) == normalized_title
    }) {
        return Err("DUPLICATE_TITLE".into());
    }
    Ok(())
}

pub(crate) fn content_stats_from_index(
    directory: &Path,
) -> Result<crate::notes::NoteContentStats, String> {
    let (paths, entry_errors) = note_paths(directory)
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

fn load_changed_note(
    path: &Path,
    backups_directory: &Path,
    note_id: &str,
    include_search_text: bool,
    issues: &mut Vec<NoteLoadIssue>,
) -> Result<LoadedNoteSummary, String> {
    match note_from_path(path) {
        Ok(note) => {
            let content_stats = Some(indexed_content_stats(&note));
            Ok(LoadedNoteSummary {
                search_text: include_search_text.then(|| note_text(&note)),
                summary: Some(summary_from_note(note)),
                content_stats,
            })
        }
        Err(error) => {
            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let (recovery_path, recovery_error) =
                match preserve_recovery_copy(path, backups_directory) {
                    Ok(path) => (Some(path), None),
                    Err(error) => (None, Some(error)),
                };
            let backup = note_backup_path(backups_directory, note_id);
            let mut message = error;
            let mut recovered = false;
            let mut summary = None;
            let mut content_stats = None;
            let mut search_text = None;
            if is_safe_regular_file(&backup).unwrap_or(false) {
                match note_from_path_with_id(&backup, note_id) {
                    Ok(note) => match read_file_bytes(&backup) {
                        Ok(bytes) => match restore_file(path, &bytes) {
                            Ok(()) => {
                                search_text = include_search_text.then(|| note_text(&note));
                                content_stats = Some(indexed_content_stats(&note));
                                summary = Some(summary_from_note(note));
                                recovered = true;
                                message = format!("A nota atual estava inválida; uma versão anterior foi restaurada. {message}");
                            }
                            Err(restore_error) => message = format!("{message} Não foi possível restaurar a cópia anterior: {restore_error}"),
                        },
                        Err(backup_error) => message = format!("{message} Não foi possível ler a cópia anterior: {backup_error}"),
                    },
                    Err(backup_error) => message = format!("{message} A cópia anterior também está inválida: {backup_error}"),
                }
            }
            if let Some(recovery_error) = recovery_error {
                message = format!(
                    "{message} Não foi possível criar uma cópia de recuperação: {recovery_error}"
                );
            }
            let issue = NoteLoadIssue {
                file_name,
                message,
                recovery_path: recovery_path.map(|path| path.to_string_lossy().into_owned()),
                recovered,
            };
            issues.push(issue.clone());
            Ok(LoadedNoteSummary {
                summary,
                content_stats,
                search_text,
            })
        }
    }
}

fn read_summary_index(directory: &Path) -> Option<SummaryIndex> {
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
        let Some(id) = entry.file_name.strip_suffix(".omega") else {
            return None;
        };
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

fn write_summary_index(directory: &Path, index: &SummaryIndex) -> Result<(), String> {
    let bytes = serde_json::to_vec(index).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > SUMMARY_INDEX_MAX_BYTES {
        return Err("Índice de resumos excede o limite permitido.".into());
    }
    crate::storage::atomic_write(&directory.join(SUMMARY_INDEX_FILE), &bytes, None)
}

fn file_stamp(path: &Path) -> Result<Option<FileStamp>, String> {
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

fn collect_backup_paths(directory: &Path) -> Result<(Vec<PathBuf>, Vec<String>), String> {
    let metadata = match fs::symlink_metadata(directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((Vec::new(), Vec::new()))
        }
        Err(error) => {
            return Err(format!(
                "Não foi possível abrir os arquivos temporários: {error}"
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Diretório de arquivos temporários inválido.".into());
    }
    let (paths, errors) = note_paths(directory)
        .map_err(|error| format!("Não foi possível abrir os arquivos temporários: {error}"))?;
    let mut backups = Vec::new();
    let mut errors = errors;
    for path in paths
        .into_iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("temp"))
    {
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                backups.push(path)
            }
            Ok(_) => errors.push(format!(
                "Arquivo temporário inseguro: {}",
                path.file_name().unwrap_or_default().to_string_lossy()
            )),
            Err(error) => errors.push(error.to_string()),
        }
    }
    Ok((backups, errors))
}

fn archived_note_exists(archive: &Path, note_id: &str) -> bool {
    let path = note_path(archive, note_id);
    fs::symlink_metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
}

fn is_safe_regular_file(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.is_file() && !metadata.file_type().is_symlink()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn summary_issue(file_name: &str, message: &str) -> NoteLoadIssue {
    NoteLoadIssue {
        file_name: file_name.into(),
        message: message.into(),
        recovery_path: None,
        recovered: false,
    }
}

pub(crate) fn update_cached_note_summaries(directory: &Path, notes: &[crate::notes::StudyNote]) {
    let Some(mut index) = read_summary_index(directory) else {
        return;
    };
    for note in notes {
        let path = note_path(directory, &note.id);
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

pub(crate) fn summary_from_note(note: crate::notes::StudyNote) -> crate::notes::NoteSummary {
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
    crate::notes::NoteSummary {
        id: note.id,
        title: note.title,
        preview: note.preview,
        updated_at: note.updated_at,
        links,
        has_content,
        has_text,
    }
}

fn visit_notes(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    receive_note: &mut impl FnMut(crate::notes::StudyNote) -> Result<(), String>,
) -> Result<
    (
        Vec<NoteLoadIssue>,
        std::collections::HashMap<String, String>,
    ),
    String,
> {
    let (directory, backups_directory) = resolve_directories()?;
    crate::notes::recover_note_rename_journal(&directory, &backups_directory)?;
    let (paths, entry_errors) = match note_paths(&directory) {
        Ok(entries) => entries,
        Err(error) => {
            return Ok((
                vec![NoteLoadIssue {
                    file_name: "notes".to_string(),
                    message: format!("Não foi possível abrir a biblioteca: {error}"),
                    recovery_path: None,
                    recovered: false,
                }],
                Default::default(),
            ));
        }
    };
    let mut issues = Vec::new();

    for error in entry_errors {
        issues.push(NoteLoadIssue {
            file_name: "notes".to_string(),
            message: format!("Não foi possível ler uma entrada da biblioteca: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }

    for path in &paths {
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        match note_from_path(path) {
            Ok(note) => receive_note(note)?,
            Err(error) => {
                let file_name = path
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Nota Ômega Notes".to_string());
                let (recovery_path, recovery_error) =
                    match preserve_recovery_copy(path, &backups_directory) {
                        Ok(path) => (Some(path), None),
                        Err(error) => (None, Some(error)),
                    };
                let mut message = error;
                let mut recovered = false;

                if let Some(note_id) = path.file_stem().and_then(|stem| stem.to_str()) {
                    let backup = note_backup_path(&backups_directory, note_id);
                    if backup.is_file() {
                        match note_from_path_with_id(&backup, note_id) {
                            Ok(note) => match read_file_bytes(&backup) {
                                Ok(bytes) => match restore_file(path, &bytes) {
                                    Ok(()) => {
                                        receive_note(note)?;
                                        recovered = true;
                                        message = format!(
                                                "A nota atual estava inválida; uma versão anterior foi restaurada. {message}"
                                            );
                                    }
                                    Err(restore_error) => {
                                        message = format!(
                                                "{message} Não foi possível restaurar a cópia anterior: {restore_error}"
                                            );
                                    }
                                },
                                Err(backup_error) => {
                                    message = format!(
                                            "{message} Não foi possível ler a cópia anterior: {backup_error}"
                                        );
                                }
                            },
                            Err(backup_error) => {
                                message = format!(
                                        "{message} A cópia anterior também está inválida: {backup_error}"
                                    );
                            }
                        }
                    }
                }

                if let Some(recovery_error) = recovery_error {
                    message = format!(
                            "{message} Não foi possível criar uma cópia de recuperação: {recovery_error}"
                        );
                }

                issues.push(NoteLoadIssue {
                    file_name,
                    message,
                    recovery_path: recovery_path.map(|path| path.to_string_lossy().into_owned()),
                    recovered,
                });
            }
        }
    }

    let (central_backup_paths, backup_entry_errors) =
        note_paths(&backups_directory).map_err(|error| {
            format!("Não foi possível abrir os arquivos temporários do Vault: {error}")
        })?;
    for error in backup_entry_errors {
        issues.push(NoteLoadIssue {
            file_name: ".temp".to_string(),
            message: format!("Não foi possível ler uma entrada de arquivo temporário: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }
    for backup in central_backup_paths
        .iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("temp"))
    {
        let Some(note_id) = note_id_from_backup(backup) else {
            continue;
        };
        let note_path = note_path(&directory, note_id);
        if note_file_exists(&directory, note_id)
            || crate::notes::note_path(&crate::notes::deleted_notes_directory(&directory), note_id)
                .is_file()
        {
            continue;
        }

        let file_name = note_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Nota Ômega Notes".to_string());
        match note_from_path_with_id(backup, note_id) {
            Ok(note) => {
                match read_file_bytes(backup) {
                    Ok(bytes) => match restore_file(&note_path, &bytes) {
                        Ok(()) => {
                            receive_note(note)?;
                            issues.push(NoteLoadIssue {
                                file_name,
                                message: "Uma gravação foi interrompida; a cópia anterior foi restaurada.".to_string(),
                                recovery_path: None,
                                recovered: true,
                            });
                        }
                        Err(error) => issues.push(NoteLoadIssue {
                            file_name,
                            message: format!(
                                "A cópia anterior é válida, mas não pôde ser restaurada: {error}"
                            ),
                            recovery_path: preserve_recovery_copy(backup, &backups_directory)
                                .ok()
                                .map(|path| path.to_string_lossy().into_owned()),
                            recovered: false,
                        }),
                    },
                    Err(error) => issues.push(NoteLoadIssue {
                        file_name,
                        message: format!("Não foi possível ler a cópia anterior: {error}"),
                        recovery_path: preserve_recovery_copy(backup, &backups_directory)
                            .ok()
                            .map(|path| path.to_string_lossy().into_owned()),
                        recovered: false,
                    }),
                }
            }
            Err(error) => issues.push(NoteLoadIssue {
                file_name,
                message: format!("A cópia anterior também está inválida: {error}"),
                recovery_path: preserve_recovery_copy(backup, &backups_directory)
                    .ok()
                    .map(|path| path.to_string_lossy().into_owned()),
                recovered: false,
            }),
        }
    }
    let (reference_titles, title_issues) = crate::notes::load_reference_titles(&directory);
    issues.extend(title_issues);
    Ok((issues, reference_titles))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TestVault {
        root: PathBuf,
        notes: PathBuf,
        backups: PathBuf,
    }

    impl TestVault {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("omega-summary-index-{}", uuid::Uuid::now_v7()));
            let notes = root.join("notes");
            let backups = root.join("backups");
            fs::create_dir_all(&notes).unwrap();
            fs::create_dir_all(&backups).unwrap();
            Self {
                root,
                notes,
                backups,
            }
        }

        fn write_note(&self, id: &str, title: &str, text: &str) {
            let mut document = crate::notes::empty_document();
            if let crate::notes::NoteElement::Text { text: contents, .. } =
                &mut document.elements[0]
            {
                *contents = text.to_string();
            }
            crate::notes::write_note(&self.notes, &self.backups, id, title, &document).unwrap();
        }

        fn summaries(&self) -> (Vec<crate::notes::NoteSummary>, Vec<NoteLoadIssue>) {
            let mut summaries = Vec::new();
            let (issues, _) = stream_note_summaries(
                &|| Ok((self.notes.clone(), self.backups.clone())),
                |summary| {
                    summaries.push(summary);
                    Ok(())
                },
            )
            .unwrap();
            (summaries, issues)
        }
    }

    impl Drop for TestVault {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn missing_invalid_and_old_summary_indexes_rebuild_without_changing_notes() {
        let vault = TestVault::new();
        let id = uuid::Uuid::now_v7().to_string();
        vault.write_note(&id, "Original", "Conteúdo preservado");
        let note_path = crate::notes::note_path(&vault.notes, &id);
        let original = fs::read(&note_path).unwrap();
        let index_path = vault.notes.join(SUMMARY_INDEX_FILE);

        let (summaries, _) = vault.summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].title, "Original");
        assert!(read_summary_index(&vault.notes).is_some());
        assert_eq!(fs::read(&note_path).unwrap(), original);

        for invalid_index in [b"not-json".as_slice(), br#"{"version":2,"entries":[]}"#] {
            fs::write(&index_path, invalid_index).unwrap();
            let (summaries, _) = vault.summaries();
            assert_eq!(summaries.len(), 1);
            assert_eq!(summaries[0].title, "Original");
            assert!(read_summary_index(&vault.notes).is_some());
            assert_eq!(fs::read(&note_path).unwrap(), original);
        }
    }

    #[test]
    fn summary_index_tracks_external_creates_edits_and_deletes() {
        let vault = TestVault::new();
        let edited_id = uuid::Uuid::now_v7().to_string();
        let retained_id = uuid::Uuid::now_v7().to_string();
        let removed_id = uuid::Uuid::now_v7().to_string();
        vault.write_note(&edited_id, "Before", "Versão antiga");
        vault.write_note(&retained_id, "Retida", "Texto");
        vault.write_note(&removed_id, "Removida", "Texto");
        vault.summaries();

        vault.write_note(&edited_id, "Depois", "Versão externa nova");
        fs::remove_file(crate::notes::note_path(&vault.notes, &removed_id)).unwrap();
        let _ = fs::remove_file(crate::notes::note_backup_path(&vault.backups, &removed_id));
        let created_id = uuid::Uuid::now_v7().to_string();
        vault.write_note(&created_id, "Criada externamente", "Texto novo");

        let (summaries, issues) = vault.summaries();
        let titles = summaries
            .into_iter()
            .map(|summary| (summary.id, summary.title))
            .collect::<HashMap<_, _>>();
        assert_eq!(titles.len(), 3);
        assert_eq!(titles.get(&edited_id).map(String::as_str), Some("Depois"));
        assert_eq!(titles.get(&retained_id).map(String::as_str), Some("Retida"));
        assert_eq!(
            titles.get(&created_id).map(String::as_str),
            Some("Criada externamente")
        );
        assert!(!titles.contains_key(&removed_id));
        assert!(issues.is_empty());
        let index = read_summary_index(&vault.notes).unwrap();
        assert_eq!(index.entries.len(), 3);
    }

    #[test]
    fn corrupt_note_recovers_from_backup_and_refreshes_its_summary() {
        let vault = TestVault::new();
        let id = uuid::Uuid::now_v7().to_string();
        vault.write_note(&id, "Versão recuperável", "Conteúdo anterior");
        vault.write_note(&id, "Versão atual", "Conteúdo atual");
        fs::write(
            crate::notes::note_path(&vault.notes, &id),
            "JSON inválido".as_bytes(),
        )
        .unwrap();

        let (summaries, issues) = vault.summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].title, "Versão recuperável");
        assert!(issues.iter().any(|issue| issue.recovered));
        assert_eq!(
            crate::notes::note_from_path(&crate::notes::note_path(&vault.notes, &id))
                .unwrap()
                .title,
            "Versão recuperável"
        );
    }

    #[test]
    fn summary_benchmark_worker() {
        let Ok(mode) = std::env::var("OMEGA_SUMMARY_BENCH_MODE") else {
            return;
        };
        let notes = PathBuf::from(std::env::var_os("OMEGA_SUMMARY_BENCH_NOTES").unwrap());
        let backups = PathBuf::from(std::env::var_os("OMEGA_SUMMARY_BENCH_BACKUPS").unwrap());
        let expected_notes = std::env::var("OMEGA_SUMMARY_BENCH_NOTE_COUNT")
            .unwrap()
            .parse::<usize>()
            .unwrap();
        let before = benchmark_read_chars();
        let started = std::time::Instant::now();
        let documents_parsed = if mode == "full" {
            let library = list_notes(&|| Ok((notes.clone(), backups.clone()))).unwrap();
            assert_eq!(library.notes.len(), expected_notes);
            expected_notes
        } else {
            assert_eq!(mode, "summaries");
            let mut count = 0;
            stream_note_summaries(&|| Ok((notes.clone(), backups.clone())), |_| {
                count += 1;
                Ok(())
            })
            .unwrap();
            assert_eq!(count, expected_notes);
            0
        };
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        let bytes_read = benchmark_read_chars().saturating_sub(before);
        println!(
            "{}",
            serde_json::json!({
                "mode": mode,
                "elapsedMs": elapsed_ms,
                "processReadChars": bytes_read,
                "documentsParsed": documents_parsed,
                "peakRssBytes": benchmark_peak_rss_bytes(),
                "profile": if cfg!(debug_assertions) { "debug" } else { "optimized" },
            })
        );
    }

    #[test]
    #[ignore = "local synthetic Vault startup diagnostic; run explicitly with --ignored --nocapture"]
    fn measure_summary_startup_on_small_and_large_vaults() {
        use std::process::Command;

        for (label, note_count, text_bytes) in [("small", 100, 1024), ("large", 2000, 8192)] {
            let vault = TestVault::new();
            let text = "x".repeat(text_bytes);
            let mut fixture_bytes = 0_u64;
            for index in 0..note_count {
                let id = uuid::Uuid::now_v7().to_string();
                let mut document = crate::notes::empty_document();
                if let crate::notes::NoteElement::Text { text: contents, .. } =
                    &mut document.elements[0]
                {
                    *contents = text.clone();
                }
                let serialized = serde_json::to_vec(&serde_json::json!({
                    "format": "omega-page",
                    "version": 2,
                    "id": id,
                    "title": format!("Nota {index}"),
                    "document": document,
                }))
                .unwrap();
                fixture_bytes = fixture_bytes.saturating_add(serialized.len() as u64);
                fs::write(crate::notes::note_path(&vault.notes, &id), serialized).unwrap();
            }
            let (initial_summaries, initial_issues) = vault.summaries();
            assert_eq!(initial_summaries.len(), note_count);
            assert!(initial_issues.is_empty());

            let mut measurements = Vec::new();
            for mode in ["full", "summaries"] {
                let output = Command::new(std::env::current_exe().unwrap())
                    .arg("--exact")
                    .arg("app::library::loading::tests::summary_benchmark_worker")
                    .arg("--nocapture")
                    .env("OMEGA_SUMMARY_BENCH_MODE", mode)
                    .env("OMEGA_SUMMARY_BENCH_NOTES", &vault.notes)
                    .env("OMEGA_SUMMARY_BENCH_BACKUPS", &vault.backups)
                    .env("OMEGA_SUMMARY_BENCH_NOTE_COUNT", note_count.to_string())
                    .output()
                    .unwrap();
                assert!(
                    output.status.success(),
                    "benchmark worker failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                let output = String::from_utf8(output.stdout).unwrap();
                let measurement = output
                    .lines()
                    .find_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                    .expect("benchmark worker must return JSON");
                measurements.push(measurement);
            }
            println!(
                "{}",
                serde_json::json!({
                    "vault": label,
                    "noteCount": note_count,
                    "fixtureNoteBytes": fixture_bytes,
                    "filesystemCache": "warm",
                    "fullDocuments": measurements[0],
                    "streamedSummaries": measurements[1],
                })
            );
        }
    }

    fn benchmark_read_chars() -> u64 {
        fs::read_to_string("/proc/self/io")
            .ok()
            .and_then(|contents| {
                contents
                    .lines()
                    .find_map(|line| line.strip_prefix("rchar:")?.trim().parse().ok())
            })
            .unwrap_or_default()
    }

    fn benchmark_peak_rss_bytes() -> Option<u64> {
        fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|contents| {
                contents.lines().find_map(|line| {
                    let kilobytes = line.strip_prefix("VmHWM:")?.split_whitespace().next()?;
                    kilobytes.parse::<u64>().ok().map(|value| value * 1024)
                })
            })
    }
}
