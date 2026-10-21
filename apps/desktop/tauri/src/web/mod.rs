mod client;
mod title;

use reqwest::{header, Client, Url};
use std::sync::OnceLock;

const MAX_HTML_BYTES: usize = 512 * 1024;

#[tauri::command]
pub(crate) async fn fetch_url_title(url: String) -> Result<Option<String>, String> {
    let url = Url::parse(&url).map_err(|_| "URL_INVALID".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("URL_INVALID".into());
    }
    static CLIENT: OnceLock<Client> = OnceLock::new();
    let client = if let Some(client) = CLIENT.get() {
        client.clone()
    } else {
        let client = client::build_client().map_err(|_| "URL_FETCH_FAILED".to_string())?;
        let _ = CLIENT.set(client.clone());
        client
    };
    let mut response = client
        .get(url)
        .header(header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| "URL_FETCH_FAILED".to_string())?;
    let html_content = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            let mime = value.split(';').next().unwrap_or("").trim();
            mime.eq_ignore_ascii_case("text/html")
                || mime.eq_ignore_ascii_case("application/xhtml+xml")
        });
    if !html_content {
        return Ok(None);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "URL_FETCH_FAILED".to_string())?
    {
        let available = MAX_HTML_BYTES - body.len();
        body.extend_from_slice(&chunk[..chunk.len().min(available)]);
        if body.len() == MAX_HTML_BYTES
            || body
                .windows(8)
                .any(|value| value.eq_ignore_ascii_case(b"</title>"))
        {
            break;
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        title::extract_title(&String::from_utf8_lossy(&body))
    })
    .await
    .map_err(|_| "URL_FETCH_FAILED".to_string())
}
