use std::collections::HashSet;
use std::path::Path;

use crate::notes::NoteLoadIssue;
use crate::{images, media, notes};

pub(super) fn collect_unreferenced_images(
    directory: &Path,
    backups_directory: &Path,
    candidates: &HashSet<String>,
) -> Result<(), String> {
    if candidates.is_empty() {
        return Ok(());
    }
    let referenced = notes::referenced_image_ids(directory, backups_directory)?;
    images::collect_unreferenced_images(directory, candidates, &referenced)
}

pub(super) fn collect_all_unreferenced_images(
    directory: &Path,
    backups_directory: &Path,
) -> Result<(), String> {
    let candidates = images::stored_image_ids(directory)?
        .into_iter()
        .collect::<HashSet<_>>();
    collect_unreferenced_images(directory, backups_directory, &candidates)
}

pub(super) fn collect_unreferenced_media(
    directory: &Path,
    backups_directory: &Path,
    audio_candidates: &HashSet<String>,
    video_candidates: &HashSet<String>,
) -> Result<(), String> {
    if audio_candidates.is_empty() && video_candidates.is_empty() {
        return Ok(());
    }
    let (referenced_audio_ids, referenced_video_ids) =
        notes::referenced_audio_and_video_ids(directory, backups_directory)?;
    media::collect_unreferenced_media(
        directory,
        audio_candidates,
        video_candidates,
        &referenced_audio_ids,
        &referenced_video_ids,
    )
}

pub(super) fn collect_all_unreferenced_media(
    directory: &Path,
    backups_directory: &Path,
) -> Result<(), String> {
    let audio_candidates = media::stored_media_ids(directory, "audio")?;
    let video_candidates = media::stored_media_ids(directory, "video")?;
    collect_unreferenced_media(
        directory,
        backups_directory,
        &audio_candidates,
        &video_candidates,
    )
}

pub(super) fn cleanup_issue(file_name: &str, message: String) -> NoteLoadIssue {
    NoteLoadIssue {
        file_name: file_name.to_string(),
        message,
        recovery_path: None,
        recovered: false,
    }
}
