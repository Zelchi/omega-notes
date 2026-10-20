use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use uuid::Uuid;

const MAX_REQUEST_BYTES: usize = 16 * 1024;
const REQUEST_WORKERS: usize = 4;
const MAX_QUEUED_REQUESTS: usize = 16;
const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(5);
const RESPONSE_WRITE_TIMEOUT: Duration = Duration::from_secs(15);

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
        let (sender, receiver) = mpsc::sync_channel::<TcpStream>(MAX_QUEUED_REQUESTS);
        let receiver = Arc::new(Mutex::new(receiver));

        for worker_id in 0..(REQUEST_WORKERS + 1) {
            let receiver = Arc::clone(&receiver);
            let resolve_media_path = Arc::clone(&resolve_media_path);
            let token = server_token.clone();
            thread::Builder::new()
                .name(format!("omega-media-request-{worker_id}"))
                .spawn(move || loop {
                    let connection = match receiver.lock() {
                        Ok(receiver) => receiver.recv(),
                        Err(_) => break,
                    };
                    let Ok(mut stream) = connection else {
                        break;
                    };
                    let _ = serve_request(&mut stream, &*resolve_media_path, &token);
                })?;
        }

        thread::Builder::new()
            .name("omega-media-stream".to_string())
            .spawn(move || {
                for connection in listener.incoming() {
                    let Ok(stream) = connection else {
                        continue;
                    };
                    if sender.send(stream).is_err() {
                        break;
                    }
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
    stream.set_write_timeout(Some(RESPONSE_WRITE_TIMEOUT))?;
    let request = match read_request(stream) {
        Ok(request) => request,
        Err(error) if error.kind() == io::ErrorKind::TimedOut => {
            return respond_empty(stream, "408 Request Timeout", &[]);
        }
        Err(error) if error.kind() == io::ErrorKind::FileTooLarge => {
            return respond_empty(stream, "431 Request Header Fields Too Large", &[]);
        }
        Err(error) if error.kind() == io::ErrorKind::InvalidData => {
            return respond_empty(stream, "400 Bad Request", &[]);
        }
        Err(error) => return Err(error),
    };
    let request = match std::str::from_utf8(&request) {
        Ok(request) => request,
        Err(_) => return respond_empty(stream, "400 Bad Request", &[]),
    };
    let mut lines = request.split("\r\n");
    let mut request_line = lines.next().unwrap_or_default().split_ascii_whitespace();
    let method = request_line.next().unwrap_or_default();
    let path = request_line.next().unwrap_or_default();
    let version = request_line.next().unwrap_or_default();
    if path.is_empty()
        || request_line.next().is_some()
        || (version != "HTTP/1.0" && version != "HTTP/1.1")
    {
        return respond_empty(stream, "400 Bad Request", &[]);
    }

    if method != "GET" && method != "HEAD" {
        return respond_empty(stream, "405 Method Not Allowed", &["Allow: GET, HEAD"]);
    }

    let mut range_header = None;
    for line in lines {
        if line.is_empty() {
            break;
        }
        if line.starts_with([' ', '\t']) {
            return respond_empty(stream, "400 Bad Request", &[]);
        }
        let Some((name, value)) = line.split_once(':') else {
            return respond_empty(stream, "400 Bad Request", &[]);
        };
        if !valid_header_name(name) {
            return respond_empty(stream, "400 Bad Request", &[]);
        }
        if name.eq_ignore_ascii_case("range") {
            if range_header.replace(value.trim()).is_some() {
                return respond_empty(stream, "400 Bad Request", &[]);
            }
        }
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
    let deadline = Instant::now() + HEADER_READ_TIMEOUT;
    while request.len() < MAX_REQUEST_BYTES {
        let remaining_time = deadline.saturating_duration_since(Instant::now());
        if remaining_time.is_zero() {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "HTTP request headers timed out",
            ));
        }
        stream.set_read_timeout(Some(remaining_time))?;
        let read_limit = (MAX_REQUEST_BYTES - request.len()).min(buffer.len());
        let bytes_read = stream.read(&mut buffer[..read_limit])?;
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..bytes_read]);
        if request.windows(4).any(|window| window == b"\r\n\r\n") {
            return Ok(request);
        }
    }
    let kind = if request.len() == MAX_REQUEST_BYTES {
        io::ErrorKind::FileTooLarge
    } else {
        io::ErrorKind::InvalidData
    };
    Err(io::Error::new(kind, "HTTP request headers are incomplete"))
}

fn valid_header_name(name: &str) -> bool {
    !name.is_empty()
        && name.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || matches!(
                    byte,
                    b'!' | b'#'
                        | b'$'
                        | b'%'
                        | b'&'
                        | b'\''
                        | b'*'
                        | b'+'
                        | b'-'
                        | b'.'
                        | b'^'
                        | b'_'
                        | b'`'
                        | b'|'
                        | b'~'
                )
        })
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
