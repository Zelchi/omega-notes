pub(crate) mod commands;
mod deleted;
mod document;
mod links;
mod models;
mod reference_titles;
mod repository;
mod services;
mod validation;

pub(crate) use deleted::{
    archive_deleted_note, deleted_notes, deleted_notes_directory, prune_deleted_notes,
    remove_deleted_note,
};
pub(crate) use document::{
    audio_ids_in_document, empty_document, image_ids_in_document, video_ids_in_document,
};
pub(crate) use links::{note_reference_targets, note_title_indexes, rename_resolved_note_links};
pub(crate) use models::{
    NoteDocument, NoteElement, NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote,
};
pub(crate) use reference_titles::{load_reference_titles, remember_reference_title};
pub(crate) use repository::{
    begin_note_rename_journal, commit_note_rename_journal, delete_note_files, existing_note,
    note_backup_exists, note_backup_path, note_file_exists, note_from_contents, note_from_path,
    note_from_path_with_id, note_id_from_backup, note_path, note_paths, preserve_recovery_copy,
    read_file_bytes, recover_note_rename_journal, restore_file, rollback_note_rename_journal,
    write_note, write_note_checked, NoteRenameJournal,
};
pub(crate) use services::{
    content_stats, referenced_audio_and_video_ids, referenced_image_ids, referenced_media_ids,
};
pub(crate) use validation::{
    ensure_unique_note_title, ensure_unique_note_title_in_directory, validate_note_id,
    validate_note_title,
};
