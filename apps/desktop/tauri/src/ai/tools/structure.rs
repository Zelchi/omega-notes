use super::{offset, reading::excerpt, required_note, text};
use serde_json::{json, Value};
use std::path::Path;

struct Heading {
    level: usize,
    title: String,
    start: usize,
    line: usize,
}
fn headings(contents: &str) -> Vec<Heading> {
    let mut result = Vec::new();
    let mut cursor = 0;
    let mut fence_length = 0;
    for (index, line) in contents.split_inclusive('\n').enumerate() {
        let trimmed = line.trim_start_matches([' ', '\t']);
        let ticks = trimmed.bytes().take_while(|byte| *byte == b'`').count();
        let fence = ticks >= 3 && !trimmed[ticks..].contains('`');
        if fence_length > 0 {
            if fence && ticks >= fence_length && trimmed[ticks..].trim().is_empty() {
                fence_length = 0;
            }
        } else if fence {
            fence_length = ticks;
        } else {
            let level = line.bytes().take_while(|byte| *byte == b'#').count();
            if (1..=6).contains(&level)
                && line
                    .as_bytes()
                    .get(level)
                    .is_some_and(|byte| *byte == b' ' || *byte == b'\t')
            {
                result.push(Heading {
                    level,
                    title: line[level..].trim().to_string(),
                    start: cursor,
                    line: index + 1,
                });
            }
        }
        cursor += line.len();
    }
    result
}
fn bounds(
    contents: &str,
    headings: &[Heading],
    section: usize,
) -> Result<(usize, usize, usize, usize), String> {
    if section == 0 {
        return Ok((
            0,
            headings
                .first()
                .map_or(contents.len(), |heading| heading.start),
            1,
            headings
                .first()
                .map_or(contents.lines().count(), |heading| heading.line - 1),
        ));
    }
    let heading = headings.get(section - 1).ok_or("AI_SECTION_NOT_FOUND")?;
    let next = headings[section..]
        .iter()
        .find(|next| next.level <= heading.level);
    Ok((
        heading.start,
        next.map_or(contents.len(), |heading| heading.start),
        heading.line,
        next.map_or(contents.lines().count(), |heading| heading.line - 1),
    ))
}
pub(super) fn outline(directory: &Path, args: &Value) -> Result<Value, String> {
    let note = required_note(directory, args, "noteId")?;
    let contents = text(&note);
    let headings = headings(&contents);
    let entries: Vec<_> = headings.iter().enumerate().skip(offset(args)).take(100).map(|(index,heading)| {
        let (start,end,start_line,end_line) = bounds(&contents,&headings,index+1).expect("existing heading");
            json!({"sectionId":index+1,"level":heading.level,"title":heading.title.chars().take(600).collect::<String>(),
                "titleTruncated":heading.title.chars().count() > 600,"startLine":start_line,"endLine":end_line,"totalCharacters":contents[start..end].chars().count()})
    }).collect();
    let (start, end, start_line, end_line) = bounds(&contents, &headings, 0)?;
    let end_offset = offset(args).saturating_add(entries.len());
    Ok(
        json!({"id":note.id,"title":note.title,"reference":super::reference(&note.id),"updatedAt":note.updated_at,"headings":entries,"total":headings.len(),
        "introduction":{"sectionId":0,"startLine":start_line,"endLine":end_line,"totalCharacters":contents[start..end].chars().count()},
        "nextOffset":(end_offset < headings.len()).then_some(end_offset)}),
    )
}
pub(super) fn read_section(directory: &Path, args: &Value) -> Result<Value, String> {
    let note = required_note(directory, args, "noteId")?;
    let contents = text(&note);
    let headings = headings(&contents);
    let section = args["sectionId"].as_u64().ok_or("AI_INVALID_ARGUMENTS")?;
    let section = usize::try_from(section).map_err(|_| "AI_SECTION_NOT_FOUND")?;
    let (start, end, start_line, end_line) = bounds(&contents, &headings, section)?;
    let mut result = excerpt(
        &contents[start..end],
        offset(args),
        args["limit"].as_u64().unwrap_or(16000) as usize,
    );
    result["id"] = json!(note.id);
    result["title"] = json!(note.title);
    result["reference"] = json!(super::reference(&note.id));
    result["updatedAt"] = json!(note.updated_at);
    result["sectionId"] = json!(section);
    result["startLine"] = json!(start_line);
    result["endLine"] = json!(end_line);
    Ok(result)
}
