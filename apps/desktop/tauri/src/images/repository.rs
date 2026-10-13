use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::storage::{atomic_copy, atomic_write};

const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

fn image_store_dir(notes_directory: &Path) -> Result<PathBuf, String> {
    let vault_directory = notes_directory
        .parent()
        .ok_or_else(|| "Pasta de notas sem um Vault válido.".to_string())?;
    Ok(vault_directory.join("images"))
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

pub(super) fn remove_image(directory: &Path, image_id: &str) -> Result<(), String> {
    let images = image_store_dir(directory)?;
    for extension in IMAGE_EXTENSIONS {
        let path = images.join(format!("{image_id}.{extension}"));
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível apagar a imagem: {error}")),
        }
    }
    Ok(())
}

pub(crate) fn stored_image_ids(directory: &Path) -> Result<Vec<String>, String> {
    let images = image_store_dir(directory)?;
    if !images.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(images)
        .map_err(|error| format!("Não foi possível abrir a biblioteca de imagens: {error}"))?;
    let mut image_ids = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Não foi possível ler uma imagem: {error}"))?;
        let path = entry.path();
        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()) || !path.is_file() {
            continue;
        }
        let Some(image_id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if Uuid::parse_str(image_id).is_ok() {
            image_ids.push(image_id.to_string());
        }
    }
    Ok(image_ids)
}
