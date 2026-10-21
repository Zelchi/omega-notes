use serde_json::{json, Value};
use std::io::{self, Write};

const MAX_SEGMENT_CHARACTERS: usize = 4_000;
const PREVIEW_CHARACTERS: usize = 180;

#[derive(Clone)]
struct Heading {
    level: usize,
    title: String,
}

#[derive(Clone)]
pub(crate) struct Segment {
    pub(crate) id: usize,
    pub(crate) kind: &'static str,
    title: String,
    heading_path: Vec<Heading>,
    start: usize,
    end: usize,
}

impl Segment {
    fn characters(&self, contents: &str) -> usize {
        contents[self.start..self.end].chars().count()
    }

    pub(crate) fn text<'a>(&self, contents: &'a str) -> &'a str {
        &contents[self.start..self.end]
    }

    pub(crate) fn descriptor(&self, contents: &str) -> Value {
        json!({
            "segmentId": self.id,
            "kind": self.kind,
            "title": self.title,
            "headingPath": self.heading_path.iter().map(|heading| json!({
                "level": heading.level,
                "title": heading.title,
            })).collect::<Vec<_>>(),
            "totalCharacters": self.characters(contents),
            "preview": self.text(contents).chars().take(PREVIEW_CHARACTERS).collect::<String>(),
        })
    }

    pub(crate) fn write_cli_text<W: Write>(
        &self,
        note_title: &str,
        contents: &str,
        writer: &mut W,
    ) -> io::Result<()> {
        writer.write_all(b"Fonte: ")?;
        writer.write_all(note_title.as_bytes())?;
        writer.write_all("\nSeção: ".as_bytes())?;
        if self.heading_path.is_empty() {
            writer.write_all("Introdução".as_bytes())?;
        } else {
            for (index, heading) in self.heading_path.iter().enumerate() {
                if index > 0 {
                    writer.write_all(b" > ")?;
                }
                writer.write_all(heading.title.as_bytes())?;
            }
        }
        writer.write_all(b"\nTipo: ")?;
        writer.write_all(if self.kind == "table" {
            b"tabela Markdown"
        } else {
            b"texto"
        })?;
        writer.write_all(b"\n\n")?;
        writer.write_all(self.text(contents).as_bytes())?;
        writer.write_all(b"\n")
    }
}

pub(crate) fn estimated_memory_bytes(segments: &[Segment]) -> usize {
    segments
        .iter()
        .map(|segment| {
            std::mem::size_of::<Segment>()
                + segment.title.len()
                + segment
                    .heading_path
                    .iter()
                    .map(|heading| std::mem::size_of::<Heading>() + heading.title.len())
                    .sum::<usize>()
        })
        .sum()
}

fn line_body(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

fn heading(line: &str) -> Option<Heading> {
    let line = line.trim_start_matches([' ', '\t']);
    let level = line.bytes().take_while(|byte| *byte == b'#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let rest = line.get(level..)?;
    if !rest.is_empty() && !rest.starts_with([' ', '\t']) {
        return None;
    }
    let title = rest.trim();
    let title = title
        .rfind(char::is_whitespace)
        .filter(|index| {
            title[*index..]
                .bytes()
                .all(|byte| byte == b'#' || byte.is_ascii_whitespace())
        })
        .map_or(title, |index| title[..index].trim_end());
    Some(Heading {
        level,
        title: title.to_string(),
    })
}

fn fence(line: &str) -> Option<(u8, usize)> {
    let line = line.trim_start_matches([' ', '\t']);
    let marker = *line.as_bytes().first()?;
    if marker != b'`' && marker != b'~' {
        return None;
    }
    let length = line.bytes().take_while(|byte| *byte == marker).count();
    if length < 3 || (marker == b'`' && line[length..].contains('`')) {
        return None;
    }
    Some((marker, length))
}

fn closes_fence(line: &str, open: (u8, usize)) -> bool {
    let line = line.trim_start_matches([' ', '\t']);
    let length = line.bytes().take_while(|byte| *byte == open.0).count();
    length >= open.1 && line[length..].trim().is_empty()
}

fn has_unescaped_pipe(line: &str) -> bool {
    let mut escaped = false;
    for character in line.chars() {
        if character == '|' && !escaped {
            return true;
        }
        if character == '\\' {
            escaped = !escaped;
        } else {
            escaped = false;
        }
    }
    false
}

fn is_table_delimiter(line: &str) -> bool {
    if !has_unescaped_pipe(line) {
        return false;
    }
    let line = line.trim().trim_matches('|');
    let cells = line.split('|').map(str::trim).collect::<Vec<_>>();
    !cells.is_empty()
        && cells.iter().all(|cell| {
            let hyphens = cell.bytes().filter(|byte| *byte == b'-').count();
            hyphens >= 3 && cell.bytes().all(|byte| byte == b'-' || byte == b':')
        })
}

fn trim_range(contents: &str, start: usize, end: usize) -> Option<(usize, usize)> {
    if start >= end {
        return None;
    }
    let raw = &contents[start..end];
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let leading = raw.len() - raw.trim_start().len();
    Some((start + leading, start + leading + trimmed.len()))
}

fn fenced_ranges(contents: &str, start: usize, end: usize) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut open: Option<((u8, usize), usize)> = None;
    let mut cursor = start;
    for line in contents[start..end].split_inclusive('\n') {
        let line_start = cursor;
        cursor += line.len();
        let body = line_body(line);
        if let Some((marker, fence_start)) = open {
            if closes_fence(body, marker) {
                ranges.push((fence_start, cursor));
                open = None;
            }
        } else if let Some(marker) = fence(body) {
            open = Some((marker, line_start));
        }
    }
    if let Some((_, fence_start)) = open {
        ranges.push((fence_start, end));
    }
    ranges
}

fn split_range(
    contents: &str,
    kind: &'static str,
    heading_path: &[Heading],
    start: usize,
    end: usize,
    segments: &mut Vec<Segment>,
    table_number: &mut usize,
) {
    let Some((mut start, end)) = trim_range(contents, start, end) else {
        return;
    };
    if kind == "table" {
        *table_number += 1;
        let title = format!("Tabela {}", *table_number);
        segments.push(Segment {
            id: segments.len() + 1,
            kind,
            title,
            heading_path: heading_path.to_vec(),
            start,
            end,
        });
        return;
    }
    let fenced = fenced_ranges(contents, start, end);
    while start < end {
        let remaining = &contents[start..end];
        let boundary = remaining
            .char_indices()
            .nth(MAX_SEGMENT_CHARACTERS)
            .map_or(remaining.len(), |(index, _)| index);
        let mut length = if boundary == 0 {
            remaining.len()
        } else {
            boundary
        };
        if length < remaining.len() {
            let newline = remaining[..length].rfind('\n').map(|index| index + 1);
            let whitespace = remaining[..length]
                .char_indices()
                .filter(|(_, character)| character.is_whitespace())
                .last()
                .map(|(index, character)| index + character.len_utf8());
            if let Some(boundary) = newline
                .filter(|boundary| *boundary > length / 2)
                .or_else(|| whitespace.filter(|boundary| *boundary > length / 2))
            {
                length = boundary;
            }
        }
        let mut chunk_end = start + length;
        if let Some((fence_start, fence_end)) = fenced
            .iter()
            .find(|(fence_start, fence_end)| *fence_start < chunk_end && chunk_end < *fence_end)
        {
            chunk_end = if *fence_start > start {
                *fence_start
            } else {
                *fence_end
            };
        }
        if let Some((chunk_start, chunk_end)) = trim_range(contents, start, chunk_end) {
            let title = heading_path
                .last()
                .map(|heading| heading.title.clone())
                .filter(|title| !title.is_empty())
                .unwrap_or_else(|| "Introdução".into());
            segments.push(Segment {
                id: segments.len() + 1,
                kind,
                title,
                heading_path: heading_path.to_vec(),
                start: chunk_start,
                end: chunk_end,
            });
        }
        start = chunk_end;
        while start < end {
            let character = contents[start..]
                .chars()
                .next()
                .expect("start is a char boundary");
            if !character.is_whitespace() {
                break;
            }
            start += character.len_utf8();
        }
    }
}

pub(crate) fn build(contents: &str) -> Vec<Segment> {
    let lines = contents
        .split_inclusive('\n')
        .scan(0usize, |start, line| {
            let range = (*start, *start + line.len());
            *start = range.1;
            Some(range)
        })
        .collect::<Vec<_>>();
    let mut segments = Vec::new();
    let mut heading_path: Vec<Heading> = Vec::new();
    let mut prose_start: Option<usize> = None;
    let mut fence_state: Option<(u8, usize)> = None;
    let mut table_number = 0;
    let mut index = 0;

    while index < lines.len() {
        let (start, end) = lines[index];
        let line = line_body(&contents[start..end]);
        if let Some(open) = fence_state {
            if closes_fence(line, open) {
                fence_state = None;
            }
            index += 1;
            continue;
        }
        if let Some(open) = fence(line) {
            fence_state = Some(open);
            if prose_start.is_none() {
                prose_start = Some(start);
            }
            index += 1;
            continue;
        }
        if let Some(next) = lines.get(index + 1) {
            let next_line = line_body(&contents[next.0..next.1]);
            if has_unescaped_pipe(line) && is_table_delimiter(next_line) {
                if let Some(prose) = prose_start.take() {
                    split_range(
                        contents,
                        "text",
                        &heading_path,
                        prose,
                        start,
                        &mut segments,
                        &mut table_number,
                    );
                }
                let mut table_end = next.1;
                index += 2;
                while index < lines.len() {
                    let row = line_body(&contents[lines[index].0..lines[index].1]);
                    if row.trim().is_empty() || !has_unescaped_pipe(row) {
                        break;
                    }
                    table_end = lines[index].1;
                    index += 1;
                }
                split_range(
                    contents,
                    "table",
                    &heading_path,
                    start,
                    table_end,
                    &mut segments,
                    &mut table_number,
                );
                continue;
            }
        }
        if let Some(found) = heading(line) {
            if let Some(prose) = prose_start.take() {
                split_range(
                    contents,
                    "text",
                    &heading_path,
                    prose,
                    start,
                    &mut segments,
                    &mut table_number,
                );
            }
            heading_path.retain(|parent| parent.level < found.level);
            heading_path.push(found);
            index += 1;
            continue;
        }
        if prose_start.is_none() {
            prose_start = Some(start);
        }
        index += 1;
    }
    if let Some(prose) = prose_start {
        split_range(
            contents,
            "text",
            &heading_path,
            prose,
            contents.len(),
            &mut segments,
            &mut table_number,
        );
    }
    segments
}
