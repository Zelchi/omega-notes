use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use uuid::Uuid;

use crate::notes::NoteLoadIssue;
use crate::{images, notes};

#[derive(Serialize)]
pub(crate) struct MediaCleanupSummary {
    pub(crate) images: usize,
}

pub(crate) fn cleanup_orphaned_media(
    directory: &Path,
    backups_directory: &Path,
) -> Result<MediaCleanupSummary, String> {
    let referenced_images =
        canonical_ids(notes::referenced_image_ids(directory, backups_directory)?);
    let orphaned_images = images::orphaned_image_candidates(directory, &referenced_images)?;
    let removed_images = images::remove_orphaned_image_files(directory, &orphaned_images)?;
    Ok(MediaCleanupSummary {
        images: removed_images,
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
            let path = std::env::temp_dir().join(format!("omega-image-cleanup-{}", Uuid::now_v7()));
            fs::create_dir_all(&path).expect("create temporary vault");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_note(path: &Path, id: &str, image: &str) {
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
                    { "type": "image", "id": Uuid::now_v7().to_string(), "x": 0.0, "y": 50.0, "width": 100.0, "height": 100.0, "imageId": image }
                ]
            }
        });
        fs::write(path, serde_json::to_vec(&value).expect("serialize note")).expect("write note");
    }

    #[test]
    fn cleanup_keeps_images_referenced_by_notes_backups_and_deleted_notes() {
        let temp = TestDirectory::new();
        let vault = &temp.0;
        let notes = vault.join("notes");
        let backups = vault.join("backups");
        let images = vault.join("images");
        let deleted = notes.join(".undo");
        for directory in [&notes, &backups, &images, &deleted] {
            fs::create_dir_all(directory).expect("create test directory");
        }

        let active_id = Uuid::now_v7().to_string();
        let backup_id = Uuid::now_v7().to_string();
        let deleted_id = Uuid::now_v7().to_string();
        let active = Uuid::now_v7().to_string();
        let backup = Uuid::now_v7().to_string();
        let deleted_image = Uuid::now_v7().to_string();
        let orphan = Uuid::now_v7().to_string();

        write_note(
            &notes.join(format!("{active_id}.omega")),
            &active_id,
            &active,
        );
        write_note(
            &backups.join(format!(".{backup_id}.omega.temp")),
            &backup_id,
            &backup,
        );
        write_note(
            &deleted.join(format!("{deleted_id}.omega")),
            &deleted_id,
            &deleted_image,
        );
        for image in [&active, &backup, &deleted_image] {
            fs::write(images.join(format!("{image}.png")), b"image")
                .expect("write referenced image");
        }
        fs::write(images.join(format!("{orphan}.png")), b"orphan").expect("write orphan image");
        fs::write(images.join("unrecognized.png"), b"unknown").expect("write unknown file");

        let result = cleanup_orphaned_media(&notes, &backups).expect("cleanup orphaned media");

        assert_eq!(result.images, 1);
        for image in [&active, &backup, &deleted_image] {
            assert!(images.join(format!("{image}.png")).is_file());
        }
        assert!(!images.join(format!("{orphan}.png")).exists());
        assert!(images.join("unrecognized.png").is_file());
    }
}
