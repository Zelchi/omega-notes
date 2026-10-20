use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::storage::atomic_copy;

use super::formats::media_extensions;

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

fn media_entries(folder: &Path) -> Result<Vec<fs::DirEntry>, String> {
    match fs::symlink_metadata(folder) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("A pasta de mídia não é um diretório seguro.".to_string())
        }
        Ok(_) => fs::read_dir(folder)
            .map_err(|error| format!("Não foi possível ler a pasta de mídia: {error}"))?
            .map(|entry| {
                entry.map_err(|error| format!("Não foi possível ler a pasta de mídia: {error}"))
            })
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!(
            "Não foi possível verificar a pasta de mídia: {error}"
        )),
    }
}

fn verify_media_directory(folder: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(folder) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("A pasta de mídia não é um diretório seguro.".to_string())
        }
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Não foi possível verificar a pasta de mídia: {error}"
        )),
    }
}

pub(super) fn existing_media_ids(
    directory: &Path,
    media_type: &str,
) -> Result<HashSet<String>, String> {
    let folder = media_directory(directory, media_type)?;
    let extensions = media_extensions(media_type)?;
    let mut ids = HashSet::new();
    for entry in media_entries(&folder)? {
        if !entry
            .file_type()
            .map_err(|error| format!("Não foi possível verificar um arquivo de mídia: {error}"))?
            .is_file()
        {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some((id, extension)) = name.rsplit_once('.') else {
            continue;
        };
        if !extensions.contains(&extension) {
            continue;
        }
        let Ok(uuid) = Uuid::parse_str(id) else {
            continue;
        };
        if uuid.to_string() == id {
            ids.insert(id.to_string());
        }
    }
    Ok(ids)
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
) -> Result<usize, String> {
    Uuid::parse_str(media_id).map_err(|_| "Identificador de mídia inválido.".to_string())?;
    let folder = media_directory(directory, media_type)?;
    if !verify_media_directory(&folder)? {
        return Ok(0);
    }
    let mut removed = 0;
    for extension in media_extensions(media_type)? {
        let path = folder.join(format!("{media_id}.{extension}"));
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("Não foi possível verificar a mídia: {error}")),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        match fs::remove_file(path) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível apagar a mídia: {error}")),
        }
    }
    Ok(removed)
}
