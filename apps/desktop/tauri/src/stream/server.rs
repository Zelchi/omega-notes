use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use uuid::Uuid;

const MAX_REQUEST_BYTES: usize = 16 * 1024;

pub(crate) struct MediaStream {
    port: u16,
    token: String,
}

impl MediaStream {
    pub(crate) fn start(
        resolve_media_path: impl Fn(&str, &str) -> Result<PathBuf, String> + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let port = listener.local_addr()?.port();
        let token = Uuid::new_v4().to_string();
        let server_token = token.clone();
        let resolve_media_path = Arc::new(resolve_media_path);

        thread::Builder::new()
            .name("omega-media-stream".to_string())
            .spawn(move || {
                for connection in listener.incoming() {
                    let Ok(mut stream) = connection else {
                        continue;
                    };
                    let resolve_media_path = resolve_media_path.clone();
                    let token = server_token.clone();
                    let _ = thread::Builder::new()
                        .name("omega-media-request".to_string())
                        .spawn(move || {
                            let _ = serve_request(&mut stream, &*resolve_media_path, &token);
                        });
                }
            })?;

        Ok(Self { port, token })
    }

    pub(super) fn url(&self, media_type: &str, media_id: &str, extension: &str) -> String {
        format!(
            "http://127.0.0.1:{}/media/{}/{media_type}/{media_id}.{extension}",
            self.port, self.token,
        )
    }
}

fn serve_request(
    stream: &mut TcpStream,
    resolve_media_path: &impl Fn(&str, &str) -> Result<PathBuf, String>,
    token: &str,
) -> io::Result<()> {
    let request = read_request(stream)?;
    let request = String::from_utf8_lossy(&request);
    let mut lines = request.split("\r\n");
    let mut request_line = lines.next().unwrap_or_default().split_whitespace();
    let method = request_line.next().unwrap_or_default();
    let path = request_line.next().unwrap_or_default();

    if method != "GET" && method != "HEAD" {
        return respond_empty(stream, "405 Method Not Allowed", &["Allow: GET, HEAD"]);
    }

    let Some((media_type, media_id, extension)) = parse_media_path(path, token) else {
        return respond_empty(stream, "404 Not Found", &[]);
    };
    let Ok(media_path) = resolve_media_path(media_id, media_type) else {
        return respond_empty(stream, "404 Not Found", &[]);
    };
    let actual_extension = media_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !actual_extension.eq_ignore_ascii_case(extension) {
        return respond_empty(stream, "404 Not Found", &[]);
    }

    let file = match File::open(&media_path) {
        Ok(file) => file,
        Err(_) => return respond_empty(stream, "404 Not Found", &[]),
    };
    let size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return respond_empty(stream, "404 Not Found", &[]),
    };
    let range_header = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("range").then(|| value.trim())
    });
    let range = match parse_byte_range(range_header, size) {
        Ok(range) => range,
        Err(()) => {
            return respond_empty(
                stream,
                "416 Range Not Satisfiable",
                &[&format!("Content-Range: bytes */{size}")],
            );
        }
    };

    let Some(mime_type) = media_content_type(media_type, extension) else {
        return respond_empty(stream, "415 Unsupported Media Type", &[]);
    };
    let (status, start, length, content_range) = match range {
        Some((start, end)) => (
            "206 Partial Content",
            start,
            end - start + 1,
            Some(format!("Content-Range: bytes {start}-{end}/{size}")),
        ),
        None => ("200 OK", 0, size, None),
    };

    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {mime_type}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n"
    )?;
    if let Some(content_range) = content_range {
        write!(stream, "{content_range}\r\n")?;
    }
    stream.write_all(b"\r\n")?;

    if method != "HEAD" && length > 0 {
        let mut file = file;
        file.seek(SeekFrom::Start(start))?;
        io::copy(&mut file.take(length), stream)?;
    }
    Ok(())
}

fn read_request(stream: &mut TcpStream) -> io::Result<Vec<u8>> {
    let mut request = Vec::with_capacity(1024);
    let mut buffer = [0_u8; 1024];
    while request.len() < MAX_REQUEST_BYTES {
        let bytes_read = stream.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..bytes_read]);
        if request.windows(4).any(|window| window == b"\r\n\r\n") {
            return Ok(request);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "HTTP request headers are incomplete or too large",
    ))
}

fn parse_media_path<'a>(path: &'a str, token: &str) -> Option<(&'a str, &'a str, &'a str)> {
    let path = path.split('?').next()?;
    let mut segments = path.strip_prefix("/media/")?.split('/');
    if segments.next()? != token {
        return None;
    }
    let media_type = segments.next()?;
    if media_type != "audio" && media_type != "video" {
        return None;
    }
    let filename = segments.next()?;
    if segments.next().is_some() {
        return None;
    }
    let (media_id, extension) = filename.rsplit_once('.')?;
    Uuid::parse_str(media_id).ok()?;
    Some((media_type, media_id, extension))
}

fn media_content_type(media_type: &str, extension: &str) -> Option<&'static str> {
    let extension = extension.to_ascii_lowercase();
    match (media_type, extension.as_str()) {
        ("audio", "aac") => Some("audio/aac"),
        ("audio", "flac") => Some("audio/flac"),
        ("audio", "m4a") => Some("audio/mp4"),
        ("audio", "mp3") => Some("audio/mpeg"),
        ("audio", "oga" | "ogg" | "opus") => Some("audio/ogg"),
        ("audio", "wav") => Some("audio/wav"),
        ("video", "mp4") => Some("video/mp4"),
        ("video", "webm") => Some("video/webm"),
        ("video", "ogv") => Some("video/ogg"),
        _ => None,
    }
}

fn parse_byte_range(header: Option<&str>, size: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(header) = header else {
        return Ok(None);
    };
    let (unit, range) = header.split_once('=').ok_or(())?;
    if !unit.eq_ignore_ascii_case("bytes") || range.contains(',') || size == 0 {
        return Err(());
    }
    let (start, end) = range.split_once('-').ok_or(())?;
    if start.is_empty() {
        let suffix_length = end.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 {
            return Err(());
        }
        return Ok(Some((size.saturating_sub(suffix_length), size - 1)));
    }

    let start = start.parse::<u64>().map_err(|_| ())?;
    if start >= size {
        return Err(());
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(size - 1)
    };
    if end < start {
        return Err(());
    }
    Ok(Some((start, end)))
}

fn respond_empty(stream: &mut TcpStream, status: &str, headers: &[&str]) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n"
    )?;
    for header in headers {
        write!(stream, "{header}\r\n")?;
    }
    stream.write_all(b"\r\n")
}
