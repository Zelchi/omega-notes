use std::path::PathBuf;

use crate::names::normalize_name;
use crate::notes::{
    begin_note_rename_journal, commit_note_rename_journal, note_from_path_with_id, note_path,
    note_title_indexes, rename_resolved_note_links, rollback_note_rename_journal, validate_note_id,
    validate_note_title, validate_note_title_length, write_note, NoteDocument, StudyNote,
};

use super::loading::stream_note_summaries;

#[derive(Debug)]
pub(crate) enum RenameNoteError {
    Validation(String),
    Context(String),
    Library(String),
    NotFound,
    Snapshot(String),
    Write(String),
    Rollback {
        write_error: String,
        rollback_error: String,
    },
}

pub(crate) fn rename_note(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_id: String,
    note_title: String,
) -> Result<Vec<StudyNote>, RenameNoteError> {
    let _title_lock = super::lock_title_mutations().map_err(RenameNoteError::Context)?;
    validate_note_id(&note_id).map_err(RenameNoteError::Validation)?;
    validate_note_title(&note_title).map_err(RenameNoteError::Validation)?;
    validate_note_title_length(&note_title).map_err(RenameNoteError::Validation)?;
    let (directory, backups_directory) = resolve_directories().map_err(RenameNoteError::Context)?;
    let mut notes = Vec::new();
    let (issues, _) = stream_note_summaries(
        &|| Ok((directory.clone(), backups_directory.clone())),
        |note| {
            notes.push(note);
            Ok(())
        },
    )
    .map_err(RenameNoteError::Library)?;
    if issues
        .iter()
        .any(|issue| issue.file_name == "notes" || issue.file_name.ends_with(".omega"))
    {
        return Err(RenameNoteError::Library("NOTE_TITLE_CHECK_FAILED".into()));
    }
    let current = notes
        .iter()
        .find(|note| note.id == note_id)
        .ok_or(RenameNoteError::NotFound)?;
    let next_title = note_title.trim();
    if current.title == next_title {
        return Ok(Vec::new());
    }

    let (notes_by_id, notes_by_title) = note_title_indexes(&notes);
    let previous_key = normalize_name(&current.title);
    let mut updates = Vec::new();
    for summary in &notes {
        let should_read_document = summary.id == note_id
            || summary.links.iter().any(|target| {
                let key = normalize_name(target);
                key == previous_key
                    && !notes_by_id.contains_key(&key)
                    && notes_by_title.get(&key).is_some_and(|id| id == &note_id)
            });
        if !should_read_document {
            continue;
        }
        let path = note_path(&directory, &summary.id);
        let metadata = std::fs::symlink_metadata(&path).map_err(|error| {
            RenameNoteError::Library(format!("Não foi possível ler a nota: {error}"))
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(RenameNoteError::Library("NOTE_READ_FAILED".into()));
        }
        let note = note_from_path_with_id(&path, &summary.id).map_err(RenameNoteError::Library)?;
        let (document, links_changed) = rename_resolved_note_links(
            &note.document,
            &current.title,
            next_title,
            &note_id,
            &notes_by_id,
            &notes_by_title,
        );
        let is_renamed_note = note.id == note_id;
        if is_renamed_note || links_changed {
            updates.push((
                note.id.clone(),
                if is_renamed_note {
                    next_title
                } else {
                    note.title.as_str()
                }
                .to_string(),
                document,
            ));
        }
    }
    updates.sort_by(|first, second| first.0.cmp(&second.0));

    let changed_ids = updates
        .iter()
        .map(|update| update.0.clone())
        .collect::<Vec<_>>();
    let journal = begin_note_rename_journal(&directory, &backups_directory, &changed_ids)
        .map_err(RenameNoteError::Snapshot)?;
    let saved = match save_renamed_notes(updates, &|id, title, document| {
        write_note(&directory, &backups_directory, id, title, document)
    }) {
        Ok(saved) => saved,
        Err(write_error) => return rollback_rename(journal, write_error),
    };
    if let Err(commit_error) = commit_note_rename_journal(&journal) {
        return rollback_rename(journal, commit_error);
    }
    super::update_cached_note_summaries(&directory, &saved);
    Ok(saved)
}

fn save_renamed_notes(
    updates: Vec<(String, String, NoteDocument)>,
    write: &impl Fn(&str, &str, &NoteDocument) -> Result<StudyNote, String>,
) -> Result<Vec<StudyNote>, String> {
    let mut saved_notes = Vec::with_capacity(updates.len());

    for (id, title, document) in updates {
        saved_notes.push(write(&id, &title, &document)?);
    }

    Ok(saved_notes)
}

fn rollback_rename(
    journal: crate::notes::NoteRenameJournal,
    write_error: String,
) -> Result<Vec<StudyNote>, RenameNoteError> {
    match rollback_note_rename_journal(&journal) {
        Ok(()) => Err(RenameNoteError::Write(write_error)),
        Err(rollback_error) => Err(RenameNoteError::Rollback {
            write_error,
            rollback_error,
        }),
    }
}
