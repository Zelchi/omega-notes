use tauri::AppHandle;

use super::models::{NoteDocument, NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote};

use crate::app::{library, runtime};

#[tauri::command]
pub(crate) async fn list_notes(
    app: AppHandle,
    vault_id: Option<String>,
    external: Option<bool>,
) -> Result<NoteLibrary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directories = runtime::notes_and_backups_dirs(&app)?;
        if let Some(id) = vault_id.as_deref() {
            if crate::ai::terminal_vault_directory(&app, id)
                .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?
                != directories.0
            {
                return Err("NOTE_LOAD_VAULT_MISMATCH".into());
            }
        }
        let library = if external == Some(true) {
            let directory = &directories.0;
            let mut notes = Vec::new();
            for entry in std::fs::read_dir(directory).map_err(|_| "NOTE_READ_FAILED")? {
                let entry = entry.map_err(|_| "NOTE_READ_FAILED")?;
                if entry.path().extension().is_none_or(|ext| ext != "omega") {
                    continue;
                }
                if entry
                    .file_type()
                    .map_err(|_| "NOTE_READ_FAILED")?
                    .is_symlink()
                {
                    return Err("NOTE_READ_FAILED".into());
                }
                notes.push(super::note_from_path(&entry.path()).map_err(|_| "NOTE_READ_FAILED")?);
            }
            let (reference_titles, issues) = super::load_reference_titles(directory);
            NoteLibrary {
                notes,
                issues,
                reference_titles,
            }
        } else {
            library::list_notes(&|| Ok(directories.clone()))?
        };
        if runtime::notes_dir(&app)? != directories.0 {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(library)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

#[derive(serde::Deserialize)]
pub(crate) struct ExpectedNote {
    title: String,
    document: NoteDocument,
}

#[tauri::command]
pub(crate) async fn notes_revision(app: AppHandle, vault_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::hash::{Hash, Hasher};
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SCAN_VAULT_CHANGED"))?;
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(&directory).map_err(|_| "NOTE_READ_FAILED")? {
            let entry = entry.map_err(|_| "NOTE_READ_FAILED")?;
            if entry.path().extension().is_none_or(|ext| ext != "omega") {
                continue;
            }
            let meta = entry.metadata().map_err(|_| "NOTE_READ_FAILED")?;
            entries.push((
                entry.file_name(),
                meta.len(),
                meta.modified().map_err(|_| "NOTE_READ_FAILED")?,
            ));
        }
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        entries.hash(&mut hash);
        if crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SCAN_VAULT_CHANGED"))?
            != directory
        {
            return Err("NOTE_SCAN_VAULT_CHANGED".into());
        }
        Ok(format!("{:x}", hash.finish()))
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

#[tauri::command]
pub(crate) fn create_note(app: AppHandle, note_title: String) -> Result<StudyNote, String> {
    library::create_note(&|| runtime::notes_and_backups_dirs(&app), note_title)
}

#[tauri::command]
pub(crate) async fn save_note(
    app: AppHandle,
    vault_id: String,
    note_id: String,
    note_title: String,
    document: NoteDocument,
    expected_note: ExpectedNote,
) -> Result<NoteSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SAVE_VAULT_CHANGED"))?;
        super::validate_note_id(&note_id)?;
        let path = super::note_path(&directory, &note_id);
        if std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return Err("NOTE_EXTERNAL_CONFLICT".into());
        }
        let stored = std::fs::read_to_string(&path).map_err(|_| "NOTE_EXTERNAL_CONFLICT")?;
        let current = super::note_from_contents(&path, &note_id, &stored)
            .map_err(|_| "NOTE_EXTERNAL_CONFLICT")?;
        if current.title != expected_note.title
            || serde_json::to_value(&current.document).map_err(|_| "NOTE_EXTERNAL_CONFLICT")?
                != serde_json::to_value(&expected_note.document)
                    .map_err(|_| "NOTE_EXTERNAL_CONFLICT")?
        {
            return Err("NOTE_EXTERNAL_CONFLICT".into());
        }
        library::save_note_checked(
            &|| {
                let directories = runtime::notes_and_backups_dirs(&app)?;
                if directories.0 != directory {
                    return Err("NOTE_SAVE_VAULT_CHANGED".into());
                }
                Ok(directories)
            },
            note_id,
            note_title,
            document,
            Some(stored.as_bytes()),
        )
    })
    .await
    .map_err(|_| "NOTE_SAVE_FAILED".to_string())?
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

#[tauri::command]
pub(crate) fn list_deleted_notes(app: AppHandle) -> Result<Vec<StudyNote>, String> {
    library::list_deleted_notes(&|| runtime::notes_and_backups_dirs(&app))
}

#[tauri::command]
pub(crate) fn restore_deleted_note(
    app: AppHandle,
    note_id: String,
) -> Result<NoteSaveResult, String> {
    library::restore_deleted_note(&|| runtime::notes_and_backups_dirs(&app), note_id)
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

fn vault_operation_error(error: String, changed: &str) -> String {
    if error == "AI_VAULT_NOT_ACTIVE" {
        changed.to_string()
    } else {
        error
    }
}
