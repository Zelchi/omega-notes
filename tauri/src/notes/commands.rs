use tauri::AppHandle;

use super::models::{NoteDocument, NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote};

use crate::app::{library, runtime};

#[tauri::command]
pub(crate) fn list_notes(app: AppHandle) -> Result<NoteLibrary, String> {
    library::list_notes(&|| runtime::notes_and_backups_dirs(&app))
}

#[tauri::command]
pub(crate) fn create_note(app: AppHandle, note_title: String) -> Result<StudyNote, String> {
    library::create_note(&|| runtime::notes_and_backups_dirs(&app), note_title)
}

#[tauri::command]
pub(crate) fn save_note(
    app: AppHandle,
    note_id: String,
    note_title: String,
    document: NoteDocument,
) -> Result<NoteSaveResult, String> {
    library::save_note(
        &|| runtime::notes_and_backups_dirs(&app),
        note_id,
        note_title,
        document,
    )
}

#[tauri::command]
pub(crate) fn rename_note(
    app: AppHandle,
    note_id: String,
    note_title: String,
) -> Result<Vec<StudyNote>, String> {
    library::rename_note(
        &|| runtime::notes_and_backups_dirs(&app),
        note_id,
        note_title,
    )
    .map_err(rename_error_message)
}

#[tauri::command]
pub(crate) fn delete_note(app: AppHandle, note_id: String) -> Result<Vec<NoteLoadIssue>, String> {
    library::delete_note(&|| runtime::notes_and_backups_dirs(&app), note_id)
}

fn rename_error_message(error: library::RenameNoteError) -> String {
    use library::RenameNoteError;

    match error {
        RenameNoteError::Validation(message)
        | RenameNoteError::Context(message)
        | RenameNoteError::Library(message)
        | RenameNoteError::Snapshot(message) => message,
        RenameNoteError::NotFound => "NOTE_NOT_FOUND".to_string(),
        RenameNoteError::Write(error) => format!("RENAME_FAILED: {error}"),
        RenameNoteError::Rollback {
            write_error,
            rollback_error,
        } => format!(
            "RENAME_ROLLBACK_FAILED: {write_error} A restauração também falhou: {rollback_error}"
        ),
    }
}
