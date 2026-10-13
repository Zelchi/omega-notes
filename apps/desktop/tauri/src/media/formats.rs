pub(super) const AUDIO_EXTENSIONS: [&str; 8] =
    ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"];
pub(super) const VIDEO_EXTENSIONS: [&str; 3] = ["mp4", "ogv", "webm"];

pub(crate) fn is_supported_extension(media_type: &str, extension: &str) -> bool {
    let extension = extension.trim_start_matches('.').to_ascii_lowercase();
    match media_type {
        "audio" => AUDIO_EXTENSIONS.contains(&extension.as_str()),
        "video" => VIDEO_EXTENSIONS.contains(&extension.as_str()),
        _ => false,
    }
}

pub(super) fn media_extensions(media_type: &str) -> Result<&'static [&'static str], String> {
    match media_type {
        "audio" => Ok(&AUDIO_EXTENSIONS),
        "video" => Ok(&VIDEO_EXTENSIONS),
        _ => Err("Tipo de mídia inválido.".to_string()),
    }
}
