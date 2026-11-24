use std::collections::HashSet;
use std::path::Path;

use uuid::Uuid;

use crate::notes::NoteLoadIssue;
use crate::{images, media, notes};

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

pub(super) fn collect_unreferenced_audio_video(
    directory: &Path,
    backups_directory: &Path,
    audio_candidates: &HashSet<String>,
    video_candidates: &HashSet<String>,
) -> Result<(), String> {
    if audio_candidates.is_empty() && video_candidates.is_empty() {
        return Ok(());
    }
    let (_, referenced_audio, referenced_video) =
        notes::referenced_media_ids(directory, backups_directory)?;
    let audio_candidates = canonical_ids(audio_candidates.clone());
    let video_candidates = canonical_ids(video_candidates.clone());
    let referenced_audio = canonical_ids(referenced_audio);
    let referenced_video = canonical_ids(referenced_video);
    media::collect_unreferenced_media(directory, "audio", &audio_candidates, &referenced_audio)?;
    media::collect_unreferenced_media(directory, "video", &video_candidates, &referenced_video)
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
    use serde_json::json;
    use std::{fs, path::PathBuf};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("omega-media-collection-{}", Uuid::now_v7()));
            fs::create_dir_all(&path).expect("create temporary vault");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_note(path: &Path, id: &str, image: &str, audio: &str, video: &str) {
        let value = json!({
            "format": "omega-page",
            "version": 2,
            "id": id,
            "title": "Cleanup test",
            "document": {
                "format": "omega-document",
                "version": 1,
                "page": { "width": 794.0, "height": 1123.0 },
                "elements": [
                    { "type": "text", "id": Uuid::now_v7().to_string(), "x": 0.0, "y": 0.0, "width": 200.0, "height": 40.0, "text": "", "alignment": "left" },
                    { "type": "image", "id": Uuid::now_v7().to_string(), "x": 0.0, "y": 50.0, "width": 100.0, "height": 100.0, "imageId": image },
                    { "type": "audio", "id": Uuid::now_v7().to_string(), "x": 0.0, "y": 160.0, "width": 340.0, "height": 60.0, "audioId": audio, "extension": "mp3", "volume": 1.0 },
                    { "type": "video", "id": Uuid::now_v7().to_string(), "x": 0.0, "y": 230.0, "width": 100.0, "height": 100.0, "videoId": video, "extension": "mp4" }
                ]
            }
        });
        fs::write(path, serde_json::to_vec(&value).expect("serialize note")).expect("write note");
    }

    #[test]
    fn automatic_media_collection_keeps_references_and_removes_only_candidates_without_references()
    {
        let temp = TestDirectory::new();
        let vault = &temp.0;
        let notes = vault.join("notes");
        let backups = vault.join("backups");
        let recovery = backups.join("Recuperação");
        let rename_journal = backups.join(".rename-in-progress");
        let images = vault.join("images");
        let audios = vault.join("audios");
        let videos = vault.join("videos");
        let deleted = notes.join(".undo");
        for directory in [
            &notes,
            &backups,
            &recovery,
            &rename_journal,
            &images,
            &audios,
            &videos,
            &deleted,
        ] {
            fs::create_dir_all(directory).expect("create test directory");
        }

        let active_id = Uuid::now_v7().to_string();
        let backup_id = Uuid::now_v7().to_string();
        let deleted_id = Uuid::now_v7().to_string();
        let recovery_id = Uuid::now_v7().to_string();
        let active = Uuid::now_v7().to_string();
        let active_audio = Uuid::now_v7().to_string();
        let active_video = Uuid::now_v7().to_string();
        let backup = Uuid::now_v7().to_string();
        let backup_audio = Uuid::now_v7().to_string();
        let backup_video = Uuid::now_v7().to_string();
        let deleted_image = Uuid::now_v7().to_string();
        let deleted_audio = Uuid::now_v7().to_string();
        let deleted_video = Uuid::now_v7().to_string();
        let recovery_image = Uuid::now_v7().to_string();
        let recovery_audio = Uuid::now_v7().to_string();
        let recovery_video = Uuid::now_v7().to_string();
        let journal_id = Uuid::now_v7().to_string();
        let journal_image = Uuid::now_v7().to_string();
        let journal_audio = Uuid::now_v7().to_string();
        let journal_video = Uuid::now_v7().to_string();
        let journal_backup_image = Uuid::now_v7().to_string();
        let journal_backup_audio = Uuid::now_v7().to_string();
        let journal_backup_video = Uuid::now_v7().to_string();
        let orphan = Uuid::now_v7().to_string();
        let orphan_audio = Uuid::now_v7().to_string();
        let orphan_video = Uuid::now_v7().to_string();

        write_note(
            &notes.join(format!("{active_id}.omega")),
            &active_id,
            &active,
            &active_audio,
            &active_video,
        );
        write_note(
            &backups.join(format!(".{backup_id}.omega.temp")),
            &backup_id,
            &backup,
            &backup_audio,
            &backup_video,
        );
        write_note(
            &deleted.join(format!("{deleted_id}.omega")),
            &deleted_id,
            &deleted_image,
            &deleted_audio,
            &deleted_video,
        );
        write_note(
            &recovery.join("preserved.recovery"),
            &recovery_id,
            &recovery_image,
            &recovery_audio,
            &recovery_video,
        );
        write_note(
            &rename_journal.join(format!("{journal_id}.note")),
            &journal_id,
            &journal_image,
            &journal_audio,
            &journal_video,
        );
        write_note(
            &rename_journal.join(format!("{journal_id}.backup")),
            &journal_id,
            &journal_backup_image,
            &journal_backup_audio,
            &journal_backup_video,
        );
        for image in [&active, &backup, &deleted_image, &recovery_image] {
            fs::write(images.join(format!("{image}.png")), b"image")
                .expect("write referenced image");
        }
        for image in [&journal_image, &journal_backup_image] {
            fs::write(images.join(format!("{image}.png")), b"image")
                .expect("write rename-journal image");
        }
        for audio in [
            &active_audio,
            &backup_audio,
            &deleted_audio,
            &recovery_audio,
        ] {
            fs::write(audios.join(format!("{audio}.mp3")), b"audio")
                .expect("write referenced audio");
        }
        for audio in [&journal_audio, &journal_backup_audio] {
            fs::write(audios.join(format!("{audio}.mp3")), b"audio")
                .expect("write rename-journal audio");
        }
        for video in [
            &active_video,
            &backup_video,
            &deleted_video,
            &recovery_video,
        ] {
            fs::write(videos.join(format!("{video}.mp4")), b"video")
                .expect("write referenced video");
        }
        for video in [&journal_video, &journal_backup_video] {
            fs::write(videos.join(format!("{video}.mp4")), b"video")
                .expect("write rename-journal video");
        }
        fs::write(images.join(format!("{orphan}.png")), b"orphan").expect("write orphan image");
        fs::write(audios.join(format!("{orphan_audio}.mp3")), b"orphan")
            .expect("write orphan audio");
        fs::write(videos.join(format!("{orphan_video}.mp4")), b"orphan")
            .expect("write orphan video");
        fs::write(images.join("unrecognized.png"), b"unknown").expect("write unknown file");

        let image_candidates: HashSet<String> = [
            active.clone(),
            backup.clone(),
            deleted_image.clone(),
            recovery_image.clone(),
            journal_image.clone(),
            journal_backup_image.clone(),
            orphan.clone(),
        ]
        .into_iter()
        .collect();
        let audio_candidates: HashSet<String> = [
            active_audio.clone(),
            backup_audio.clone(),
            deleted_audio.clone(),
            recovery_audio.clone(),
            journal_audio.clone(),
            journal_backup_audio.clone(),
            orphan_audio.clone(),
        ]
        .into_iter()
        .collect();
        let video_candidates: HashSet<String> = [
            active_video.clone(),
            backup_video.clone(),
            deleted_video.clone(),
            recovery_video.clone(),
            journal_video.clone(),
            journal_backup_video.clone(),
            orphan_video.clone(),
        ]
        .into_iter()
        .collect();
        collect_unreferenced_images(&notes, &backups, &image_candidates)
            .expect("collect unreferenced images");
        collect_unreferenced_audio_video(&notes, &backups, &audio_candidates, &video_candidates)
            .expect("collect unreferenced audio and video");
        for (image, audio, video) in [
            (&active, &active_audio, &active_video),
            (&backup, &backup_audio, &backup_video),
            (&deleted_image, &deleted_audio, &deleted_video),
            (&recovery_image, &recovery_audio, &recovery_video),
            (&journal_image, &journal_audio, &journal_video),
            (
                &journal_backup_image,
                &journal_backup_audio,
                &journal_backup_video,
            ),
        ] {
            assert!(images.join(format!("{image}.png")).is_file());
            assert!(audios.join(format!("{audio}.mp3")).is_file());
            assert!(videos.join(format!("{video}.mp4")).is_file());
        }
        assert!(!images.join(format!("{orphan}.png")).exists());
        assert!(!audios.join(format!("{orphan_audio}.mp3")).exists());
        assert!(!videos.join(format!("{orphan_video}.mp4")).exists());
        assert!(images.join("unrecognized.png").is_file());
    }
}
