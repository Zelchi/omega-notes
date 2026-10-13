use std::path::PathBuf;

pub(super) fn note_media_stream_url(
    resolve_media_path: &impl Fn(&str, &str) -> Result<PathBuf, String>,
    build_stream_url: &impl Fn(&str, &str, &str) -> String,
    media_id: &str,
    media_type: &str,
) -> Result<String, String> {
    let path = resolve_media_path(media_id, media_type)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Extensão de mídia inválida.".to_string())?
        .to_ascii_lowercase();
    Ok(build_stream_url(media_type, media_id, &extension))
}
