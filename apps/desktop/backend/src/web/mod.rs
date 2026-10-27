mod client;
mod title;

use reqwest::{header, Client, Url};
use std::{sync::OnceLock, time::Duration};

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

pub(crate) fn parse_public_https_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "MUSIC_URL_INVALID".to_string())?;
    if !client::is_safe_https_target_url(&url) {
        return Err("MUSIC_URL_INVALID".into());
    }
    Ok(url)
}

pub(crate) async fn fetch_audio_stream(url: Url) -> Result<reqwest::Response, String> {
    if !client::is_safe_https_target_url(&url) {
        return Err("MUSIC_URL_INVALID".into());
    }
    static CLIENT: OnceLock<Client> = OnceLock::new();
    let client = if let Some(client) = CLIENT.get() {
        client.clone()
    } else {
        let client = client::build_media_stream_client().map_err(|_| "MUSIC_STREAM_FAILED")?;
        let _ = CLIENT.set(client.clone());
        client
    };
    fetch_audio_stream_with_client(&client, url, client::MEDIA_STREAM_IDLE_TIMEOUT).await
}

async fn fetch_audio_stream_with_client(
    client: &Client,
    url: Url,
    header_timeout: Duration,
) -> Result<reqwest::Response, String> {
    let response = tokio::time::timeout(
        header_timeout,
        client.get(url).header(header::ACCEPT, "audio/mpeg").send(),
    )
    .await
    .map_err(|_| "MUSIC_STREAM_FAILED".to_string())?
    .and_then(reqwest::Response::error_for_status)
    .map_err(|_| "MUSIC_STREAM_FAILED".to_string())?;
    if !response.status().is_success() {
        return Err("MUSIC_STREAM_FAILED".into());
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
        str::FromStr,
        thread,
        time::Instant,
    };

    fn fixture_client(address: SocketAddr, idle_timeout: Duration) -> Client {
        client::build_media_stream_client_with(
            Client::builder().resolve("radio.fixture", address),
            idle_timeout,
        )
        .unwrap()
    }

    fn read_request(stream: &mut TcpStream) {
        let mut request = Vec::new();
        let mut byte = [0; 1];
        while !request.ends_with(b"\r\n\r\n") {
            if stream.read(&mut byte).unwrap() == 0 {
                break;
            }
            request.push(byte[0]);
        }
    }

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

    #[test]
    fn music_stream_urls_must_be_public_https_targets() {
        assert!(parse_public_https_url("https://radio.example/live.mp3").is_ok());
        for value in [
            "http://radio.example/live.mp3",
            "https://127.0.0.1/live.mp3",
            "https://192.168.1.1/live.mp3",
            "https://user:pass@radio.example/live.mp3",
            "file:///etc/passwd",
        ] {
            assert!(parse_public_https_url(value).is_err(), "{value}");
        }
    }

    #[tokio::test]
    async fn silent_fixture_before_headers_hits_the_header_deadline() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            thread::sleep(Duration::from_millis(250));
        });
        let client = fixture_client(address, Duration::from_millis(100));
        let url = Url::parse(&format!("http://radio.fixture:{}/stream", address.port())).unwrap();

        let result = fetch_audio_stream_with_client(&client, url, Duration::from_millis(100)).await;
        assert!(
            result.is_err(),
            "a response that never sends headers must time out"
        );
        server.join().unwrap();
    }

    #[tokio::test]
    async fn silent_fixture_between_chunks_hits_the_idle_read_timeout() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nContent-Length: 2\r\nConnection: close\r\n\r\nx")
                .unwrap();
            stream.flush().unwrap();
            thread::sleep(Duration::from_millis(250));
        });
        let client = fixture_client(address, Duration::from_millis(100));
        let url = Url::parse(&format!("http://radio.fixture:{}/stream", address.port())).unwrap();
        let mut response = fetch_audio_stream_with_client(&client, url, Duration::from_millis(100))
            .await
            .unwrap();

        assert_eq!(&response.chunk().await.unwrap().unwrap()[..], b"x");
        assert!(
            response.chunk().await.is_err(),
            "an idle body read must time out"
        );
        server.join().unwrap();
    }

    #[tokio::test]
    async fn periodic_chunks_keep_a_long_stream_alive_past_the_idle_interval() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n1\r\na\r\n")
                .unwrap();
            stream.flush().unwrap();
            thread::sleep(Duration::from_millis(70));
            stream.write_all(b"1\r\nb\r\n").unwrap();
            stream.flush().unwrap();
            thread::sleep(Duration::from_millis(70));
            stream.write_all(b"0\r\n\r\n").unwrap();
        });
        let client = fixture_client(address, Duration::from_millis(100));
        let url = Url::parse(&format!("http://radio.fixture:{}/stream", address.port())).unwrap();
        let mut response = fetch_audio_stream_with_client(&client, url, Duration::from_millis(100))
            .await
            .unwrap();
        let started = Instant::now();
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.unwrap() {
            body.extend_from_slice(&chunk);
        }

        assert_eq!(body, b"ab");
        assert!(started.elapsed() > Duration::from_millis(100));
        server.join().unwrap();
    }
}
