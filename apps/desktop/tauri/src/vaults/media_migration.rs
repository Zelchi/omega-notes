use serde_json::Value;
use std::fs;
use std::path::Path;

use crate::storage::atomic_write_checked;

const MIGRATION_MARKER: &str = ".audio-video-removed-v1";

pub(super) fn remove_legacy_media(
    vault_directory: &Path,
    backups_directory: &Path,
) -> Result<(), String> {
    match fs::symlink_metadata(vault_directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("A pasta do vault não é um diretório seguro.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Não foi possível acessar a pasta do vault: {error}"
            ))
        }
    };
    let marker = vault_directory.join(MIGRATION_MARKER);
    match fs::symlink_metadata(&marker) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => return Ok(()),
        Ok(_) => return Err("O marcador de limpeza de mídias não é um arquivo seguro.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Não foi possível verificar a limpeza de mídias: {error}"
            ))
        }
    }

    let notes = vault_directory.join("notes");
    for (directory, extensions) in [
        (notes.clone(), vec!["omega"]),
        (notes.join(".undo"), vec!["omega"]),
        (backups_directory.to_path_buf(), vec!["temp"]),
        (backups_directory.join("Recuperação"), vec!["recovery"]),
    ] {
        remove_legacy_elements_from_directory(&directory, &extensions)?;
    }

    for name in ["audios", "videos"] {
        remove_vault_media_directory(&vault_directory.join(name))?;
    }
    atomic_write_checked(&marker, b"removed", None, None)
}

fn remove_legacy_elements_from_directory(
    directory: &Path,
    extensions: &[&str],
) -> Result<(), String> {
    match fs::symlink_metadata(directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("A pasta de notas ou backups não é um diretório seguro.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Não foi possível verificar a pasta de notas ou backups: {error}"
            ))
        }
    }
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Não foi possível ler os arquivos antigos de mídia: {error}"))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Não foi possível ler um arquivo antigo de mídia: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            format!("Não foi possível verificar um arquivo antigo de mídia: {error}")
        })?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        if !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extensions.contains(&extension))
        {
            continue;
        }
        remove_legacy_elements_from_file(&path)?;
    }
    Ok(())
}

fn remove_legacy_elements_from_file(path: &Path) -> Result<(), String> {
    let contents = fs::read(path)
        .map_err(|error| format!("Não foi possível ler um arquivo antigo de mídia: {error}"))?;
    let Ok(mut note) = serde_json::from_slice::<Value>(&contents) else {
        return Ok(());
    };
    let Some(elements) = note
        .pointer_mut("/document/elements")
        .and_then(Value::as_array_mut)
    else {
        return Ok(());
    };
    let previous_len = elements.len();
    elements.retain(|element| {
        !matches!(
            element.get("type").and_then(Value::as_str),
            Some("audio" | "video")
        )
    });
    if elements.len() == previous_len {
        return Ok(());
    }
    let serialized = serde_json::to_vec_pretty(&note)
        .map_err(|error| format!("Não foi possível preparar a limpeza das notas: {error}"))?;
    atomic_write_checked(path, &serialized, None, Some(&contents))
}

fn remove_vault_media_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(path).map_err(|error| {
                format!("Não foi possível apagar a pasta de mídia antiga: {error}")
            })
        }
        Ok(metadata) if metadata.file_type().is_symlink() => fs::remove_file(path)
            .map_err(|error| format!("Não foi possível remover o atalho de mídia antigo: {error}")),
        Ok(_) => Err("A pasta de mídia antiga não é um diretório seguro.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível verificar a pasta de mídia antiga: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::remove_legacy_media;
    use serde_json::{json, Value};
    use std::{
        fs,
        path::{Path, PathBuf},
    };
    use uuid::Uuid;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("omega-media-migration-{}", Uuid::now_v7()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn note(id: &str) -> Value {
        json!({
            "format": "omega-page",
            "version": 2,
            "id": id,
            "title": "Migration",
            "document": {
                "format": "omega-document",
                "version": 1,
                "page": { "width": 794, "height": 1123 },
                "elements": [
                    { "type": "text", "id": Uuid::now_v7().to_string(), "x": 0, "y": 0, "width": 200, "height": 40, "text": "Keep me", "alignment": "left" },
                    { "type": "image", "id": Uuid::now_v7().to_string(), "x": 0, "y": 50, "width": 100, "height": 100, "imageId": Uuid::now_v7().to_string() },
                    { "type": "audio", "id": Uuid::now_v7().to_string(), "x": 0, "y": 160, "width": 100, "height": 40, "audioId": Uuid::now_v7().to_string(), "extension": "mp3", "volume": 1 },
                    { "type": "video", "id": Uuid::now_v7().to_string(), "x": 0, "y": 210, "width": 100, "height": 100, "videoId": Uuid::now_v7().to_string(), "extension": "mp4" }
                ]
            }
        })
    }

    fn write_note(path: &Path, id: &str) {
        fs::write(path, serde_json::to_vec(&note(id)).unwrap()).unwrap();
    }

    #[test]
    fn removes_legacy_media_from_notes_backups_recovery_and_vault_files() {
        let temp = TestDirectory::new();
        let vault = &temp.0;
        let notes = vault.join("notes");
        let backups = temp.0.join("backups");
        let deleted = notes.join(".undo");
        let recovery = backups.join("Recuperação");
        let images = vault.join("images");
        let audios = vault.join("audios");
        let videos = vault.join("videos");
        for directory in [
            &notes, &backups, &deleted, &recovery, &images, &audios, &videos,
        ] {
            fs::create_dir_all(directory).unwrap();
        }

        let id = Uuid::now_v7().to_string();
        write_note(&notes.join(format!("{id}.omega")), &id);
        write_note(&backups.join(format!(".{id}.omega.temp")), &id);
        write_note(&deleted.join(format!("{id}.omega")), &id);
        write_note(&recovery.join(format!("{id}.omega.recovery")), &id);
        fs::write(audios.join("old.mp3"), b"audio").unwrap();
        fs::write(videos.join("old.mp4"), b"video").unwrap();
        fs::write(images.join("keep.gif"), b"gif").unwrap();

        remove_legacy_media(vault, &backups).unwrap();

        for path in [
            notes.join(format!("{id}.omega")),
            backups.join(format!(".{id}.omega.temp")),
            deleted.join(format!("{id}.omega")),
            recovery.join(format!("{id}.omega.recovery")),
        ] {
            let document: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
            let elements = document["document"]["elements"].as_array().unwrap();
            assert_eq!(elements.len(), 2);
            assert!(elements.iter().any(|element| element["type"] == "text"));
            assert!(elements.iter().any(|element| element["type"] == "image"));
        }
        assert!(!audios.exists());
        assert!(!videos.exists());
        assert!(images.join("keep.gif").is_file());
    }

    #[test]
    fn media_migration_is_idempotent() {
        let temp = TestDirectory::new();
        let notes = temp.0.join("notes");
        let backups = temp.0.join("backups");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&backups).unwrap();

        remove_legacy_media(&temp.0, &backups).unwrap();
        remove_legacy_media(&temp.0, &backups).unwrap();

        assert!(temp.0.join(".audio-video-removed-v1").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn migration_does_not_follow_symlinked_note_directories() {
        use std::os::unix::fs::symlink;

        let temp = TestDirectory::new();
        let vault = temp.0.join("vault");
        let external_notes = temp.0.join("external-notes");
        let backups = temp.0.join("backups");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&external_notes).unwrap();
        fs::create_dir_all(&backups).unwrap();
        let id = Uuid::now_v7().to_string();
        write_note(&external_notes.join(format!("{id}.omega")), &id);
        symlink(&external_notes, vault.join("notes")).unwrap();

        assert!(remove_legacy_media(&vault, &backups).is_err());
        let document: Value =
            serde_json::from_slice(&fs::read(external_notes.join(format!("{id}.omega"))).unwrap())
                .unwrap();
        assert!(document["document"]["elements"]
            .as_array()
            .unwrap()
            .iter()
            .any(|element| element["type"] == "audio"));
        assert!(!vault.join(".audio-video-removed-v1").exists());
    }
}
