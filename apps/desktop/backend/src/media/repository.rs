use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::storage::atomic_copy;

use super::formats::media_extensions;

fn media_directory(notes_directory: &Path, media_type: &str) -> Result<PathBuf, String> {
    let vault_directory = notes_directory
        .parent()
        .ok_or_else(|| "Pasta de notas sem um Vault válido.".to_string())?;
    match media_type {
        "audio" => Ok(vault_directory.join("audios")),
        "video" => Ok(vault_directory.join("videos")),
        _ => Err("Tipo de mídia inválido.".to_string()),
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

fn ensure_media_directory(folder: &Path) -> Result<(), String> {
    if verify_media_directory(folder)? {
        return Ok(());
    }
    fs::create_dir_all(folder)
        .map_err(|error| format!("Não foi possível criar a pasta de mídia: {error}"))?;
    if verify_media_directory(folder)? {
        Ok(())
    } else {
        Err("A pasta de mídia não foi criada.".to_string())
    }
}

fn media_entries(folder: &Path) -> Result<Vec<fs::DirEntry>, String> {
    if !verify_media_directory(folder)? {
        return Ok(Vec::new());
    }
    fs::read_dir(folder)
        .map_err(|error| format!("Não foi possível ler a pasta de mídia: {error}"))?
        .map(|entry| entry.map_err(|error| format!("Não foi possível ler a pasta de mídia: {error}")))
        .collect()
}

pub(super) fn existing_media_ids(
    notes_directory: &Path,
    media_type: &str,
) -> Result<HashSet<String>, String> {
    let folder = media_directory(notes_directory, media_type)?;
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
        .find(|allowed| *allowed == extension)
        .ok_or_else(|| "Formato de mídia não compatível.".to_string())
}

pub(super) fn store_copy(
    notes_directory: &Path,
    media_id: &str,
    media_type: &str,
    extension: &str,
    source: &Path,
) -> Result<(), String> {
    if !media_extensions(media_type)?.contains(&extension) {
        return Err("Formato de mídia não compatível.".to_string());
    }
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("Não foi possível abrir a mídia: {error}"))?;
    if !source_metadata.is_file() || source_metadata.file_type().is_symlink() {
        return Err("O arquivo de mídia precisa ser regular.".to_string());
    }
    let folder = media_directory(notes_directory, media_type)?;
    ensure_media_directory(&folder)?;
    atomic_copy(source, &folder.join(format!("{media_id}.{extension}")))
}

pub(super) fn find_media(
    notes_directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<Option<PathBuf>, String> {
    let folder = media_directory(notes_directory, media_type)?;
    let extensions = media_extensions(media_type)?;
    if !verify_media_directory(&folder)? {
        return Ok(None);
    }
    for extension in extensions {
        let path = folder.join(format!("{media_id}.{extension}"));
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                return Ok(Some(path));
            }
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!("Não foi possível verificar a mídia: {error}"));
            }
        }
    }
    Ok(None)
}

pub(super) fn media_path(
    notes_directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<PathBuf, String> {
    let uuid = Uuid::parse_str(media_id)
        .map_err(|_| "Identificador de mídia inválido.".to_string())?;
    if uuid.to_string() != media_id {
        return Err("Identificador de mídia inválido.".to_string());
    }
    find_media(notes_directory, media_id, media_type)?
        .ok_or_else(|| "Mídia não encontrada.".to_string())
}

pub(super) fn remove_media(
    notes_directory: &Path,
    media_id: &str,
    media_type: &str,
) -> Result<usize, String> {
    let uuid = Uuid::parse_str(media_id)
        .map_err(|_| "Identificador de mídia inválido.".to_string())?;
    if uuid.to_string() != media_id {
        return Err("Identificador de mídia inválido.".to_string());
    }
    let folder = media_directory(notes_directory, media_type)?;
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
