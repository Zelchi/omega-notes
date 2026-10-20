use std::collections::HashSet;
use std::path::PathBuf;

use uuid::Uuid;

use crate::names::normalize_name;
use crate::notes::{
    archive_deleted_note, audio_ids_in_document, delete_note_files, deleted_notes,
    deleted_notes_directory, empty_document, ensure_unique_note_title, existing_note,
    image_ids_in_document, note_backup_exists, note_backup_path, note_from_path_with_id, note_path,
    prune_deleted_notes, remove_deleted_note, validate_note_id, validate_note_title,
    video_ids_in_document, write_note, NoteDocument, NoteLoadIssue, NoteSaveResult, StudyNote,
};

use super::cleanup::{cleanup_issue, collect_unreferenced_images, collect_unreferenced_media};
use super::loading::list_notes;

pub(crate) fn create_note(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_title: String,
) -> Result<StudyNote, String> {
    let (directory, backups_directory) = resolve_directories()?;
    validate_note_title(&note_title)?;
    let notes = list_notes(&|| Ok((directory.clone(), backups_directory.clone())))?.notes;
    ensure_unique_note_title(&notes, &note_title, None)?;
    let note_id = Uuid::now_v7().to_string();
    write_note(
        &directory,
        &backups_directory,
        &note_id,
        note_title.trim(),
        &empty_document(),
    )
}

pub(crate) fn save_note(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_id: String,
    note_title: String,
    document: NoteDocument,
) -> Result<NoteSaveResult, String> {
    save_note_checked(resolve_directories, note_id, note_title, document, None)
}

pub(crate) fn save_note_checked(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_id: String,
    note_title: String,
    document: NoteDocument,
    expected: Option<&[u8]>,
) -> Result<NoteSaveResult, String> {
    validate_note_id(&note_id)?;
    let (directory, backups_directory) = resolve_directories()?;
    validate_note_title(&note_title)?;
    let existing = existing_note(&directory, &note_id)?;
    if existing
        .as_ref()
        .is_none_or(|note| normalize_name(&note.title) != normalize_name(&note_title))
    {
        let notes = list_notes(&|| Ok((directory.clone(), backups_directory.clone())))?.notes;
        ensure_unique_note_title(&notes, &note_title, Some(&note_id))?;
    }
    let previous_document = existing
        .as_ref()
        .map(|note| note.document.clone())
        .unwrap_or_else(empty_document);
    let mut previous_images = image_ids_in_document(&previous_document);
    let mut previous_audio = audio_ids_in_document(&previous_document);
    let mut previous_video = video_ids_in_document(&previous_document);
    let previous_backup = note_backup_path(&backups_directory, &note_id);
    if note_backup_exists(&backups_directory, &note_id) {
        if let Ok(document) = note_from_path_with_id(&previous_backup, &note_id) {
            previous_images.extend(image_ids_in_document(&document.document));
            previous_audio.extend(audio_ids_in_document(&document.document));
            previous_video.extend(video_ids_in_document(&document.document));
        }
    }
    let current_images = image_ids_in_document(&document);
    let current_audio = audio_ids_in_document(&document);
    let current_video = video_ids_in_document(&document);
    let saved = crate::notes::write_note_checked(
        &directory,
        &backups_directory,
        &note_id,
        note_title.trim(),
        &document,
        expected,
    )?;

    let removed_images = previous_images
        .difference(&current_images)
        .cloned()
        .collect::<HashSet<_>>();
    let mut cleanup_issues = Vec::new();
    if let Err(error) = collect_unreferenced_images(&directory, &backups_directory, &removed_images)
    {
        cleanup_issues.push(cleanup_issue(
            "images",
            format!(
                "A nota foi salva, mas não foi possível limpar imagens sem referência: {error}"
            ),
        ));
    }
    let removed_audio = previous_audio
        .difference(&current_audio)
        .cloned()
        .collect::<HashSet<_>>();
    let removed_video = previous_video
        .difference(&current_video)
        .cloned()
        .collect::<HashSet<_>>();
    if let Err(error) = collect_unreferenced_media(
        &directory,
        &backups_directory,
        &removed_audio,
        &removed_video,
    ) {
        cleanup_issues.push(cleanup_issue(
            "Mídias",
            format!("A nota foi salva, mas não foi possível limpar mídias sem referência: {error}"),
        ));
    }

    Ok(NoteSaveResult {
        note: saved,
        cleanup_issues,
    })
}

pub(crate) fn delete_note(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_id: String,
) -> Result<Vec<NoteLoadIssue>, String> {
    validate_note_id(&note_id)?;
    let (directory, backups_directory) = resolve_directories()?;
    let note = existing_note(&directory, &note_id)?.ok_or("Nota não encontrada.")?;
    crate::notes::remember_reference_title(&directory, &note_id, &note.title)?;
    let previous_document = note.document;
    archive_deleted_note(&directory, &note_id)?;
    delete_note_files(&directory, &backups_directory, &note_id)?;
    let mut removed_images = image_ids_in_document(&previous_document);
    let mut removed_audio = audio_ids_in_document(&previous_document);
    let mut removed_video = video_ids_in_document(&previous_document);
    let mut cleanup_issues = Vec::new();
    match prune_deleted_notes(&directory) {
        Ok(documents) => {
            for document in documents {
                removed_images.extend(image_ids_in_document(&document));
                removed_audio.extend(audio_ids_in_document(&document));
                removed_video.extend(video_ids_in_document(&document));
            }
        }
        Err(error) => cleanup_issues.push(cleanup_issue(".undo", error)),
    }
    if let Err(error) = collect_unreferenced_images(&directory, &backups_directory, &removed_images)
    {
        cleanup_issues.push(cleanup_issue(
            "images",
            format!(
                "A nota foi apagada, mas não foi possível limpar imagens sem referência: {error}"
            ),
        ));
    }
    if let Err(error) = collect_unreferenced_media(
        &directory,
        &backups_directory,
        &removed_audio,
        &removed_video,
    ) {
        cleanup_issues.push(cleanup_issue(
            "Mídias",
            format!(
                "A nota foi apagada, mas não foi possível limpar mídias sem referência: {error}"
            ),
        ));
    }
    Ok(cleanup_issues)
}

pub(crate) fn list_deleted_notes(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
) -> Result<Vec<StudyNote>, String> {
    let (directory, _) = resolve_directories()?;
    deleted_notes(&directory)
}

pub(crate) fn restore_deleted_note(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
    note_id: String,
) -> Result<NoteSaveResult, String> {
    validate_note_id(&note_id)?;
    let (directory, backups_directory) = resolve_directories()?;
    if existing_note(&directory, &note_id)?.is_some() {
        return Err("NOTE_ALREADY_EXISTS".into());
    }
    let note = note_from_path_with_id(
        &note_path(&deleted_notes_directory(&directory), &note_id),
        &note_id,
    )?;
    let mut result = save_note(
        &|| Ok((directory.clone(), backups_directory.clone())),
        note_id.clone(),
        note.title,
        note.document,
    )?;
    if let Err(error) = remove_deleted_note(&directory, &note_id) {
        result.cleanup_issues.push(cleanup_issue(".undo", error));
    }
    Ok(result)
}
