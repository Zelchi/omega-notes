mod client;
mod title;

use reqwest::{header, Client, Url};
use std::sync::OnceLock;

const MAX_HTML_BYTES: usize = 512 * 1024;

pub(crate) async fn fetch_url_title(url: String) -> Result<Option<String>, String> {
    let url = Url::parse(&url).map_err(|_| "URL_INVALID".to_string())?;
    if !client::is_safe_target_url(&url) {
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
    crate::runtime::spawn_blocking(move || title::extract_title(&String::from_utf8_lossy(&body)))
        .await
        .map_err(|_| "URL_FETCH_FAILED".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::IpAddr, str::FromStr};

    #[test]
    fn rejects_non_public_literal_targets() {
        for value in [
            "http://127.0.0.1",
            "http://10.0.0.1",
            "http://100.64.0.1",
            "http://169.254.169.254",
            "http://192.168.1.1",
            "http://[::1]",
            "http://[fc00::1]",
            "http://[::ffff:127.0.0.1]",
            "http://[2001:db8::1]",
            "file:///etc/passwd",
            "https://user:password@example.com",
        ] {
            assert!(
                !client::is_safe_target_url(&Url::parse(value).unwrap()),
                "{value}"
            );
        }
        assert!(client::is_safe_target_url(
            &Url::parse("https://example.com").unwrap()
        ));
        assert!(client::is_safe_target_url(
            &Url::parse("http://8.8.8.8").unwrap()
        ));
    }

    #[test]
    fn only_global_addresses_are_allowed_from_dns() {
        for address in [
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.0.0.9",
            "192.0.2.1",
            "192.88.99.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "240.0.0.1",
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "2001::1",
            "2002::1",
            "3fff::1",
        ] {
            assert!(
                !client::is_public_ip(IpAddr::from_str(address).unwrap()),
                "{address}"
            );
        }
        for address in ["8.8.8.8", "2606:4700:4700::1111"] {
            assert!(
                client::is_public_ip(IpAddr::from_str(address).unwrap()),
                "{address}"
            );
        }
        let public = "8.8.8.8:0".parse().unwrap();
        let private = "192.168.1.1:0".parse().unwrap();
        assert!(client::validate_public_addresses(vec![public]).is_ok());
        assert!(client::validate_public_addresses(vec![public, private]).is_err());
    }
}
