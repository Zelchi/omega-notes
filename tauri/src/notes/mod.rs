pub(crate) mod commands;
mod document;
mod links;
mod models;
mod repository;
mod services;
mod validation;

pub(crate) use document::{
    audio_ids_in_document, empty_document, image_ids_in_document, video_ids_in_document,
};
pub(crate) use links::{note_title_indexes, rename_resolved_note_links};
pub(crate) use models::{NoteDocument, NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote};
pub(crate) use repository::{
    delete_note_files, existing_note, existing_note_document, note_backup_exists, note_backup_path,
    note_file_exists, note_from_path, note_from_path_with_id, note_id_from_backup, note_path,
    note_paths, preserve_recovery_copy, read_file_bytes, restore_file, restore_note_files,
    snapshot_note_files, write_note,
};
pub(crate) use services::{content_stats, referenced_audio_and_video_ids, referenced_image_ids};
pub(crate) use validation::{ensure_unique_note_title, validate_note_id, validate_note_title};
