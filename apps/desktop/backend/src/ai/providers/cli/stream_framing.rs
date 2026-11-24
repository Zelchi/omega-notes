use serde_json::Value;
use std::io::{BufRead, Read};

const MAX_LINE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, PartialEq)]
pub(super) enum Frame {
    Event(Value),
    InvalidJson,
    Unterminated,
    End,
}

pub(super) fn read_frame(reader: &mut impl BufRead) -> Frame {
    let mut line = String::new();
    match reader.take(MAX_LINE_BYTES).read_line(&mut line) {
        Ok(size) if size > 0 && line.ends_with('\n') => {
            serde_json::from_str(&line).map_or(Frame::InvalidJson, Frame::Event)
        }
        Ok(size) if size > 0 => Frame::Unterminated,
        _ => Frame::End,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{self, BufReader, Cursor};

    #[test]
    fn reads_multiple_json_events_without_combining_lines() {
        let mut reader = Cursor::new(b"{\"id\":1}\n{\"id\":2}\n");
        assert_eq!(read_frame(&mut reader), Frame::Event(json!({"id":1})));
        assert_eq!(read_frame(&mut reader), Frame::Event(json!({"id":2})));
        assert_eq!(read_frame(&mut reader), Frame::End);
    }

    #[test]
    fn distinguishes_invalid_json_from_unterminated_and_empty_streams() {
        assert_eq!(
            read_frame(&mut Cursor::new(b"not json\n")),
            Frame::InvalidJson
        );
        assert_eq!(
            read_frame(&mut Cursor::new(b"{\"id\":1}")),
            Frame::Unterminated
        );
        assert_eq!(read_frame(&mut Cursor::new(b"")), Frame::End);
        assert_eq!(read_frame(&mut Cursor::new([0xff, b'\n'])), Frame::End);
    }

    #[test]
    fn enforces_the_exact_four_mebibyte_line_limit() {
        let mut valid = vec![b' '; MAX_LINE_BYTES as usize - 2];
        valid.extend_from_slice(b"0\n");
        assert_eq!(read_frame(&mut Cursor::new(valid)), Frame::Event(json!(0)));

        let mut oversized = vec![b' '; MAX_LINE_BYTES as usize - 1];
        oversized.extend_from_slice(b"0\n");
        let mut reader = Cursor::new(oversized);
        assert_eq!(read_frame(&mut reader), Frame::Unterminated);
        assert_eq!(reader.position(), MAX_LINE_BYTES);
    }

    #[test]
    fn io_errors_end_the_stream() {
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read failed"))
            }
        }
        assert_eq!(read_frame(&mut BufReader::new(Broken)), Frame::End);
    }
}
