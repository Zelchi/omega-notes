use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use uuid::Uuid;

use crate::notes::NoteLoadIssue;
use crate::{images, media, notes};

#[derive(Serialize)]
pub(crate) struct MediaCleanupSummary {
    pub(crate) images: usize,
    pub(crate) audio: usize,
    pub(crate) video: usize,
}

pub(crate) fn cleanup_orphaned_media(
    directory: &Path,
    backups_directory: &Path,
) -> Result<MediaCleanupSummary, String> {
    let (referenced_images, referenced_audio, referenced_video) =
        notes::referenced_media_ids(directory, backups_directory)?;
    let referenced_images = canonical_ids(referenced_images);
    let referenced_audio = canonical_ids(referenced_audio);
    let referenced_video = canonical_ids(referenced_video);
    let orphaned_images = images::orphaned_image_candidates(directory, &referenced_images)?;
    let orphaned_audio = media::orphaned_media_candidates(directory, "audio", &referenced_audio)?;
    let orphaned_video = media::orphaned_media_candidates(directory, "video", &referenced_video)?;
    let removed_images = images::remove_orphaned_image_files(directory, &orphaned_images)?;
    let removed_audio = media::remove_orphaned_media_files(directory, "audio", &orphaned_audio)?;
    let removed_video = media::remove_orphaned_media_files(directory, "video", &orphaned_video)?;
    Ok(MediaCleanupSummary {
        images: removed_images,
        audio: removed_audio,
        video: removed_video,
    })
}

fn canonical_ids(ids: HashSet<String>) -> HashSet<String> {
    ids.into_iter()
        .filter_map(|id| Uuid::parse_str(&id).ok().map(|uuid| uuid.to_string()))
        .collect()
}

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

pub(super) fn cleanup_issue(file_name: &str, message: String) -> NoteLoadIssue {
    NoteLoadIssue {
        file_name: file_name.to_string(),
        message,
        recovery_path: None,
        recovered: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::{fs, path::PathBuf};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("omega-media-cleanup-{}", Uuid::now_v7()));
            fs::create_dir_all(&path).expect("create temporary vault");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_note(id: &str, image: &str, audio: &str, video: &str) -> Value {
        let element = || Uuid::now_v7().to_string();
        json!({
            "format": "omega-page",
            "version": 2,
            "id": id,
            "title": "Cleanup test",
            "document": {
                "format": "omega-document",
                "version": 1,
                "page": { "width": 794.0, "height": 1123.0 },
                "elements": [
                    { "type": "text", "id": element(), "x": 0.0, "y": 0.0, "width": 200.0, "height": 40.0, "text": "", "alignment": "left" },
                    { "type": "image", "id": element(), "x": 0.0, "y": 50.0, "width": 100.0, "height": 100.0, "imageId": image },
                    { "type": "audio", "id": element(), "x": 0.0, "y": 160.0, "width": 100.0, "height": 40.0, "audioId": audio, "extension": "mp3", "volume": 1.0 },
                    { "type": "video", "id": element(), "x": 0.0, "y": 210.0, "width": 100.0, "height": 100.0, "videoId": video, "extension": "mp4" }
                ]
            }
        })
    }

    fn write_note(path: &Path, id: &str, image: &str, audio: &str, video: &str) {
        fs::write(
            path,
            serde_json::to_vec(&test_note(id, image, audio, video)).expect("serialize note"),
        )
        .expect("write note");
    }

    #[test]
    fn cleanup_keeps_media_referenced_by_notes_backups_and_deleted_notes() {
        let temp = TestDirectory::new();
        let vault = &temp.0;
        let notes = vault.join("notes");
        let backups = vault.join("backups");
        let images = vault.join("images");
        let audio = vault.join("audios");
        let video = vault.join("videos");
        let deleted = notes.join(".undo");
        for directory in [&notes, &backups, &images, &audio, &video, &deleted] {
            fs::create_dir_all(directory).expect("create test directory");
        }

        let active_id = Uuid::now_v7().to_string();
        let backup_id = Uuid::now_v7().to_string();
        let deleted_id = Uuid::now_v7().to_string();
        let active = [
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
        ];
        let backup = [
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
        ];
        let deleted_refs = [
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
        ];
        let orphan = [
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
            Uuid::now_v7().to_string(),
        ];

        write_note(
            &notes.join(format!("{active_id}.omega")),
            &active_id,
            &active[0],
            &active[1],
            &active[2],
        );
        write_note(
            &backups.join(format!(".{backup_id}.omega.temp")),
            &backup_id,
            &backup[0],
            &backup[1],
            &backup[2],
        );
        write_note(
            &deleted.join(format!("{deleted_id}.omega")),
            &deleted_id,
            &deleted_refs[0],
            &deleted_refs[1],
            &deleted_refs[2],
        );

        for references in [&active, &backup, &deleted_refs] {
            fs::write(images.join(format!("{}.png", references[0])), b"image")
                .expect("write referenced image");
            fs::write(audio.join(format!("{}.mp3", references[1])), b"audio")
                .expect("write referenced audio");
            fs::write(video.join(format!("{}.mp4", references[2])), b"video")
                .expect("write referenced video");
        }
        fs::write(images.join(format!("{}.png", orphan[0])), b"orphan image")
            .expect("write orphan image");
        fs::write(audio.join(format!("{}.mp3", orphan[1])), b"orphan audio")
            .expect("write orphan audio");
        fs::write(video.join(format!("{}.mp4", orphan[2])), b"orphan video")
            .expect("write orphan video");
        fs::write(images.join("unrecognized.png"), b"unknown").expect("write unknown file");

        let result = cleanup_orphaned_media(&notes, &backups).expect("cleanup orphaned media");

        assert_eq!(result.images, 1);
        assert_eq!(result.audio, 1);
        assert_eq!(result.video, 1);
        for references in [&active, &backup, &deleted_refs] {
            assert!(images.join(format!("{}.png", references[0])).is_file());
            assert!(audio.join(format!("{}.mp3", references[1])).is_file());
            assert!(video.join(format!("{}.mp4", references[2])).is_file());
        }
        assert!(!images.join(format!("{}.png", orphan[0])).exists());
        assert!(!audio.join(format!("{}.mp3", orphan[1])).exists());
        assert!(!video.join(format!("{}.mp4", orphan[2])).exists());
        assert!(images.join("unrecognized.png").is_file());
    }
}
