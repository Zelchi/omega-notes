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

fn char_boundaries(text: &str) -> Vec<usize> {
    text.char_indices()
        .map(|(byte, _)| byte)
        .chain(std::iter::once(text.len()))
        .collect()
}

fn mention_range(
    text: &str,
    boundaries: &[usize],
    mention: &Mention,
    base: usize,
    unlink: bool,
    mask: &[bool],
    wiki_links: &[(usize, usize)],
) -> Result<(usize, usize), String> {
    let count = boundaries.len() - 1;
    if mention.end <= mention.start
        || mention.start < base
        || mention.start >= base + count
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
    if text[start..end] != mention.text {
        return Err(
            "AI_MENTION_TEXT_MISMATCH: The selected range does not exactly match mention.text. Read the current note and recompute the text and offsets.".into(),
        );
    }
    if unlink {
        if !wiki_links.contains(&(start, end)) {
            return Err(
                "AI_INVALID_LINK_RANGE: Unlink requires one complete existing internal link."
                    .into(),
            );
        }
    } else if mask[start..end].iter().any(|protected| *protected) {
        return Err(
            "AI_PROTECTED_TEXT: The selected text overlaps code, an existing link, a URL, or other protected markup. Choose a different plain-text span.".into(),
        );
    }

    if !unlink
        && ((mention.text.starts_with(char::is_alphanumeric)
            && text[..start].ends_with(char::is_alphanumeric))
            || (mention.text.ends_with(char::is_alphanumeric)
                && text[end..].starts_with(char::is_alphanumeric)))
    {
        return Err("AI_PARTIAL_WORD".into());
    }

    Ok((start, end))
}

fn ensure_revision(note: &StudyNote, expected: &str) -> Result<(), String> {
    if revision(note)? != expected {
        return Err(
            "AI_NOTE_REVISION_MISMATCH: The note revision differs from the one read. Read the current note and recompute all mention text and offsets.".into(),
        );
    }
    Ok(())
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
    ensure_revision(&note, &args.revision)?;
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
        let boundaries = char_boundaries(text);
        let count = boundaries.len() - 1;
        let (mask, wiki_links) = protected(text);
        let mut edits = Vec::new();
        for mention in &mentions {
            if mention.start < base || mention.start >= base + count {
                continue;
            }
            let (start, end) =
                mention_range(text, &boundaries, mention, base, unlink, &mask, &wiki_links)?;
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

#[cfg(test)]
mod tests {
    use super::{char_boundaries, ensure_revision, mention_range, protected, Mention};
    use crate::notes::{NoteDocument, StudyNote};
    use serde_json::json;

    fn mention_at(text: &str, needle: &str, submitted_text: &str) -> Mention {
        let byte_start = text.find(needle).expect("needle should occur in test text");
        let start = text[..byte_start].chars().count();
        Mention {
            start,
            end: start + submitted_text.chars().count(),
            text: submitted_text.to_string(),
            target_id: "target-note".into(),
        }
    }

    #[test]
    fn accepts_exact_plain_prose_after_unicode() {
        let text = "Em inteligência artificial (especialmente em sistemas agênticos), um agente operacional confiável.";
        let boundaries = char_boundaries(text);
        let (mask, wiki_links) = protected(text);

        for phrase in ["sistemas agênticos", "agente"] {
            let mention = mention_at(text, phrase, phrase);
            let range =
                mention_range(text, &boundaries, &mention, 0, false, &mask, &wiki_links).unwrap();

            assert_eq!(&text[range.0..range.1], phrase);
        }
    }

    #[test]
    fn distinguishes_text_mismatch_from_protected_text() {
        let text = "Em um agente operacional.";
        let mention = mention_at(text, "agente", "agentes");
        let boundaries = char_boundaries(text);
        let (mask, wiki_links) = protected(text);

        let error =
            mention_range(text, &boundaries, &mention, 0, false, &mask, &wiki_links).unwrap_err();

        assert!(error.starts_with("AI_MENTION_TEXT_MISMATCH:"));
    }

    #[test]
    fn rejects_exact_text_inside_existing_wiki_link_as_protected() {
        let text = "Veja [[note-id|agente]] aqui.";
        let mention = mention_at(text, "agente", "agente");
        let boundaries = char_boundaries(text);
        let (mask, wiki_links) = protected(text);

        let error =
            mention_range(text, &boundaries, &mention, 0, false, &mask, &wiki_links).unwrap_err();

        assert!(error.starts_with("AI_PROTECTED_TEXT:"));
    }

    #[test]
    fn accepts_complete_existing_wiki_link_for_unlink() {
        let text = "Veja [[note-id|agente]] aqui.";
        let mention = mention_at(text, "[[note-id|agente]]", "[[note-id|agente]]");
        let boundaries = char_boundaries(text);
        let (mask, wiki_links) = protected(text);

        let range =
            mention_range(text, &boundaries, &mention, 0, true, &mask, &wiki_links).unwrap();

        assert_eq!(&text[range.0..range.1], "[[note-id|agente]]");
    }

    #[test]
    fn identifies_stale_read_revision_separately() {
        let note = StudyNote {
            id: "source-note".into(),
            title: "Harness - IA".into(),
            document: serde_json::from_value::<NoteDocument>(json!({
                "format": "omega-document",
                "version": 1,
                "page": {"width": 794.0, "height": 1123.0},
                "elements": [{
                    "type": "text",
                    "id": "text-element",
                    "x": 32.0,
                    "y": 32.0,
                    "width": 728.0,
                    "height": 44.0,
                    "text": "um agente operacional confiável",
                    "alignment": "left"
                }]
            }))
            .unwrap(),
            updated_at: 0,
        };

        let error = ensure_revision(&note, "stale-revision").unwrap_err();

        assert!(error.starts_with("AI_NOTE_REVISION_MISMATCH:"));
    }
}
