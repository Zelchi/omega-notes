use crate::notes::{NoteElement, StudyNote};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::Path,
};

pub(super) fn revision(note: &StudyNote) -> Result<String, String> {
    let mut hash = DefaultHasher::new();
    note.title.hash(&mut hash);
    serde_json::to_vec(&note.document)
        .map_err(|_| "AI_READ_FAILED")?
        .hash(&mut hash);
    Ok(format!("{:016x}", hash.finish()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Arguments {
    note_id: String,
    revision: String,
    mentions: Vec<Mention>,
    #[serde(default)]
    operation: Operation,
}
#[derive(Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Operation {
    #[default]
    Link,
    Unlink,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Mention {
    start: usize,
    end: usize,
    text: String,
    target_id: String,
}

fn protected(text: &str) -> (Vec<bool>, Vec<(usize, usize)>) {
    let mut mask = vec![false; text.len()];
    let mut wiki_links = Vec::new();
    let mut offset = 0;
    let mut fence: Option<(u8, usize)> = None;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start_matches([' ', '\t']);
        let marker = trimmed.as_bytes().first().copied().unwrap_or(0);
        let length = trimmed.bytes().take_while(|byte| *byte == marker).count();
        let is_fence = matches!(marker, b'`' | b'~') && length >= 3;
        let fenced = fence.is_some() || is_fence;
        if let Some((opening, size)) = fence {
            if is_fence
                && marker == opening
                && length >= size
                && trimmed[length..].trim().is_empty()
            {
                fence = None;
            }
        } else if is_fence {
            fence = Some((marker, length));
        }
        if fenced || line.starts_with("    ") || line.starts_with('\t') {
            mask[offset..offset + line.len()].fill(true);
        } else {
            let bytes = line.as_bytes();
            let mut i = 0;
            while i < bytes.len() {
                let start = i;
                let tail = &line[i..];
                let end = if bytes[i] == b'`' {
                    let ticks = bytes[i..].iter().take_while(|byte| **byte == b'`').count();
                    let marker = "`".repeat(ticks);
                    line[i + ticks..]
                        .find(&marker)
                        .map_or(line.len(), |end| i + ticks + end + ticks)
                } else if bytes[i] == b'[' {
                    if tail.starts_with("[[") {
                        if let Some(end) = tail.find("]]") {
                            let body = &tail[2..end];
                            if !body.contains(['[', ']', '\r', '\n']) {
                                wiki_links.push((offset + i, offset + i + end + 2));
                            }
                            i + end + 2
                        } else {
                            line.len()
                        }
                    } else {
                        let mut end = tail.find(']').map_or(line.len(), |end| i + end + 1);
                        if bytes.get(end) == Some(&b'(') {
                            let mut depth = 0;
                            for (position, byte) in bytes.iter().enumerate().skip(end) {
                                if *byte == b'(' {
                                    depth += 1;
                                }
                                if *byte == b')' {
                                    depth -= 1;
                                    if depth == 0 {
                                        end = position + 1;
                                        break;
                                    }
                                }
                                end = position + 1;
                            }
                        }
                        end
                    }
                } else if bytes[i..]
                    .get(..8)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"https://"))
                    || bytes[i..]
                        .get(..7)
                        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"http://"))
                    || bytes[i..]
                        .get(..4)
                        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"www."))
                {
                    tail.find(char::is_whitespace)
                        .map_or(line.len(), |end| i + end)
                } else if bytes[i] == b'<' {
                    tail.find('>').map_or(line.len(), |end| i + end + 1)
                } else if bytes[i] == b'\\' {
                    i + 1 + line[i + 1..].chars().next().map_or(0, char::len_utf8)
                } else {
                    i += line[i..].chars().next().unwrap().len_utf8();
                    continue;
                };
                mask[offset + start..offset + end].fill(true);
                i = end;
            }
        }
        offset += line.len();
    }
    (mask, wiki_links)
}

pub(super) fn prepare(directory: &Path, args: &Value) -> Result<Value, String> {
    let args: Arguments =
        serde_json::from_value(args.clone()).map_err(|_| "AI_INVALID_ARGUMENTS")?;
    let note = super::required_note(directory, &json!({"noteId":args.note_id}), "noteId")?;
    let unlink = args.operation == Operation::Unlink;
    if revision(&note)? != args.revision {
        return Err("AI_NOTE_CHANGED: Read the note again before changing links.".into());
    }
    let mut mentions = args.mentions;
    mentions.sort_by_key(|mention| mention.start);
    if mentions.is_empty()
        || mentions.len() > 100
        || mentions.windows(2).any(|pair| pair[0].end > pair[1].start)
    {
        return Err("AI_INVALID_MENTIONS".into());
    }
    let mut document = note.document.clone();
    let mut base = 0;
    let mut applied = 0;
    let mut links = Vec::new();
    for element in &mut document.elements {
        let NoteElement::Text { text, .. } = element else {
            continue;
        };
        let boundaries: Vec<_> = text
            .char_indices()
            .map(|(byte, _)| byte)
            .chain(std::iter::once(text.len()))
            .collect();
        let count = boundaries.len() - 1;
        let (mask, wiki_links) = protected(text);
        let mut edits = Vec::new();
        for mention in &mentions {
            if mention.start < base || mention.start >= base + count {
                continue;
            }
            if mention.end <= mention.start
                || mention.end > base + count
                || mention.text.trim().is_empty()
                || (!unlink && mention.text.chars().count() > 300)
                || (!unlink
                    && mention
                        .text
                        .contains(['[', ']', '|', '`', '\\', '\r', '\n', '<', '>']))
            {
                return Err("AI_INVALID_MENTION_RANGE".into());
            }
            let start = boundaries[mention.start - base];
            let end = boundaries[mention.end - base];
            if text[start..end] != mention.text
                || (if unlink {
                    !wiki_links.contains(&(start, end))
                } else {
                    mask[start..end].iter().any(|protected| *protected)
                })
            {
                return Err("AI_PROTECTED_OR_CHANGED_TEXT".into());
            }
            if !unlink
                && ((mention.text.starts_with(char::is_alphanumeric)
                    && text[..start].ends_with(char::is_alphanumeric))
                    || (mention.text.ends_with(char::is_alphanumeric)
                        && text[end..].starts_with(char::is_alphanumeric)))
            {
                return Err("AI_PARTIAL_WORD".into());
            }
            let target =
                super::required_note(directory, &json!({"noteId":mention.target_id}), "noteId")?;
            let replacement = if unlink {
                let body = &mention.text[2..mention.text.len() - 2];
                let (id, label) = body
                    .split_once('|')
                    .map_or((body, None), |(id, label)| (id, Some(label)));
                if id != target.id {
                    return Err("AI_INVALID_LINK_TARGET".into());
                }
                if label.is_some_and(|label| label.trim().is_empty()) {
                    return Err("AI_EMPTY_LINK_LABEL".into());
                }
                label.unwrap_or(&target.title).to_string()
            } else if mention.text == target.title {
                super::reference(&target.id)
            } else {
                format!("[[{}|{}]]", target.id, mention.text)
            };
            edits.push((start, end, replacement));
            links.push(json!({"id":target.id,"title":target.title,"reference":super::reference(&target.id),"label":mention.text}));
        }
        base += count + 1;
        applied += edits.len();
        for (start, end, replacement) in edits.into_iter().rev() {
            text.replace_range(start..end, &replacement);
        }
    }
    if applied != mentions.len() {
        return Err("AI_INVALID_MENTION_RANGE".into());
    }
    Ok(
        json!({"operation":if unlink {"unlink"} else {"link"},"noteId":note.id,"title":note.title,"expectedDocument":note.document,"document":document,"links":links}),
    )
}
