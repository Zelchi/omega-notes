use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::storage::atomic_copy;

use super::formats::{is_supported_extension, media_extensions};

fn media_directory(notes_directory: &Path, media_type: &str) -> Result<PathBuf, String> {
    let directory = notes_directory
        .parent()
        .ok_or_else(|| "Pasta de notas sem um Vault válido.".to_string())?;
    match media_type {
        "audio" => Ok(directory.join("audios")),
        "video" => Ok(directory.join("videos")),
        _ => Err("Tipo de mídia inválido.".to_string()),
    }
}

pub(super) fn extension_from_path(source: &Path, media_type: &str) -> Result<&'static str, String> {
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Extensão de mídia ausente.".to_string())?
        .to_ascii_lowercase();
    media_extensions(media_type)?
        .iter()
        .copied()
        .find(|allowed| *allowed == extension.as_str())
        .ok_or_else(|| "Formato de mídia não compatível.".to_string())
}

pub(super) fn store_copy(
    directory: &Path,
    media_id: &str,
    media_type: &str,
    extension: &str,
    source: &Path,
) -> Result<(), String> {
    let folder = media_directory(directory, media_type)?;
    fs::create_dir_all(&folder)
        .map_err(|error| format!("Não foi possível criar a pasta de mídia: {error}"))?;
    atomic_copy(source, &folder.join(format!("{media_id}.{extension}")))
}

pub(super) fn find_media(
    directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<Option<PathBuf>, String> {
    let folder = media_directory(directory, media_type)?;
    Ok(media_extensions(media_type)?
        .iter()
        .map(|extension| folder.join(format!("{media_id}.{extension}")))
        .find(|path| path.is_file()))
}

pub(super) fn media_path(
    directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<PathBuf, String> {
    Uuid::parse_str(media_id).map_err(|_| "Identificador de mídia inválido.".to_string())?;
    find_media(directory, media_id, media_type)?.ok_or_else(|| "Mídia não encontrada.".to_string())
}

pub(super) fn remove_media(
    directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<(), String> {
    let folder = media_directory(directory, media_type)?;
    for extension in media_extensions(media_type)? {
        let path = folder.join(format!("{media_id}.{extension}"));
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível apagar a mídia: {error}")),
        }
    }
    Ok(())
}

pub(crate) fn stored_media_ids(
    directory: &Path,
    media_type: &str,
) -> Result<HashSet<String>, String> {
    let folder = media_directory(directory, media_type)?;
    if !folder.exists() {
        return Ok(HashSet::new());
    }
    let entries = fs::read_dir(folder)
        .map_err(|error| format!("Não foi possível abrir os arquivos de mídia: {error}"))?;
    let mut media_ids = HashSet::new();
    for entry in entries {
        let path = entry
            .map_err(|error| format!("Não foi possível ler um arquivo de mídia: {error}"))?
            .path();
        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_supported_extension(media_type, extension) || !path.is_file() {
            continue;
        }
        let Some(media_id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if Uuid::parse_str(media_id).is_ok() {
            media_ids.insert(media_id.to_string());
        }
    }
    Ok(media_ids)
}
