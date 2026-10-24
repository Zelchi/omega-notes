use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::storage::{atomic_copy, atomic_write};

const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

fn image_store_dir(notes_directory: &Path) -> Result<PathBuf, String> {
    let vault_directory = notes_directory
        .parent()
        .ok_or_else(|| "Pasta de notas sem um Vault válido.".to_string())?;
    Ok(vault_directory.join("images"))
}

fn image_entries(folder: &Path) -> Result<Vec<fs::DirEntry>, String> {
    match fs::symlink_metadata(folder) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("A pasta de imagens não é um diretório seguro.".to_string())
        }
        Ok(_) => fs::read_dir(folder)
            .map_err(|error| format!("Não foi possível ler a pasta de imagens: {error}"))?
            .map(|entry| {
                entry.map_err(|error| format!("Não foi possível ler a pasta de imagens: {error}"))
            })
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!(
            "Não foi possível verificar a pasta de imagens: {error}"
        )),
    }
}

fn verify_image_directory(folder: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(folder) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("A pasta de imagens não é um diretório seguro.".to_string())
        }
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Não foi possível verificar a pasta de imagens: {error}"
        )),
    }
}

pub(super) fn existing_image_ids(directory: &Path) -> Result<HashSet<String>, String> {
    let images = image_store_dir(directory)?;
    let mut ids = HashSet::new();
    for entry in image_entries(&images)? {
        if !entry
            .file_type()
            .map_err(|error| format!("Não foi possível verificar um arquivo de imagem: {error}"))?
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
        if !IMAGE_EXTENSIONS.contains(&extension) {
            continue;
        }
        let Ok(uuid) = uuid::Uuid::parse_str(id) else {
            continue;
        };
        if uuid.to_string() == id {
            ids.insert(id.to_string());
        }
    }
    Ok(ids)
}

pub(super) fn extension_from_bytes(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok("png");
    }
    if bytes.starts_with(b"\xff\xd8\xff") {
        return Ok("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok("gif");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return Ok("webp");
    }
    if bytes.starts_with(b"BM") {
        return Ok("bmp");
    }
    if bytes.get(4..8) == Some(b"ftyp")
        && bytes
            .get(8..12)
            .is_some_and(|brand| brand.starts_with(b"avif") || brand.starts_with(b"avis"))
    {
        return Ok("avif");
    }

    Err("O arquivo não é uma imagem compatível.".to_string())
}

pub(super) fn extension_from_path(source_path: &Path) -> Result<&'static str, String> {
    let mut file = fs::File::open(source_path)
        .map_err(|error| format!("Não foi possível abrir a imagem: {error}"))?;
    let mut header = [0u8; 12];
    let count = file
        .read(&mut header)
        .map_err(|error| format!("Não foi possível ler a imagem: {error}"))?;
    extension_from_bytes(&header[..count])
}

pub(super) fn store_copy(
    directory: &Path,
    image_id: &str,
    extension: &str,
    source: &Path,
) -> Result<(), String> {
    let images = image_store_dir(directory)?;
    fs::create_dir_all(&images)
        .map_err(|error| format!("Não foi possível criar a pasta de imagens: {error}"))?;
    atomic_copy(source, &images.join(format!("{image_id}.{extension}")))
}

pub(super) fn store_bytes(directory: &Path, image_id: &str, bytes: &[u8]) -> Result<(), String> {
    let extension = extension_from_bytes(bytes)?;
    let images = image_store_dir(directory)?;
    fs::create_dir_all(&images)
        .map_err(|error| format!("Não foi possível criar a pasta de imagens: {error}"))?;
    atomic_write(&images.join(format!("{image_id}.{extension}")), bytes, None)
}

pub(super) fn read_image(directory: &Path, image_id: &str) -> Result<Vec<u8>, String> {
    let images = image_store_dir(directory)?;
    let path = IMAGE_EXTENSIONS
        .into_iter()
        .map(|extension| images.join(format!("{image_id}.{extension}")))
        .find(|path| path.is_file())
        .ok_or_else(|| "Imagem não encontrada.".to_string())?;
    fs::read(path).map_err(|error| format!("Não foi possível ler a imagem: {error}"))
}

pub(super) fn remove_image(directory: &Path, image_id: &str) -> Result<usize, String> {
    uuid::Uuid::parse_str(image_id).map_err(|_| "Identificador de imagem inválido.".to_string())?;
    let images = image_store_dir(directory)?;
    if !verify_image_directory(&images)? {
        return Ok(0);
    }
    let mut removed = 0;
    for extension in IMAGE_EXTENSIONS {
        let path = images.join(format!("{image_id}.{extension}"));
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("Não foi possível verificar a imagem: {error}")),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        match fs::remove_file(path) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível apagar a imagem: {error}")),
        }
    }
    Ok(removed)
}
