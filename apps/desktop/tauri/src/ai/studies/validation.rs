use super::{Deck, Item, Kind, Outcome, Progress};

pub(super) fn validate_reports(
    progress: &Progress,
    items: &[Item],
    kind: &Kind,
) -> Result<(), String> {
    let item_count = items.len();
    let Some(entries) = &progress.responses else {
        return Ok(());
    };
    if !matches!(kind, Kind::Written | Kind::Cloze) || entries.len() > item_count {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    let mut seen = std::collections::HashSet::new();
    for entry in entries {
        if entry.item_index >= item_count
            || !seen.insert(entry.item_index)
            || entry.answer.chars().count() > 4000
            || entry.reviewed_at > 9_007_199_254_740_991
            || !progress.items.iter().any(|item| {
                item.item_index == entry.item_index && item.last_outcome == entry.outcome
            })
        {
            return Err("STUDY_STORAGE_FAILED".into());
        }
        let results = entry
            .feedback
            .as_ref()
            .and_then(|feedback| feedback.blank_results.as_ref());
        if entry.blank_answers.is_some() || results.is_some() {
            let answers = entry.blank_answers.as_ref().ok_or("STUDY_STORAGE_FAILED")?;
            let blanks = items[entry.item_index]
                .blanks
                .as_ref()
                .ok_or("STUDY_STORAGE_FAILED")?;
            if !matches!(kind, Kind::Cloze)
                || answers.len() != blanks.len()
                || answers.iter().any(|answer| answer.chars().count() > 200)
                || results.is_some_and(|results| results.len() != answers.len())
                || entry.feedback.is_some() && results.is_none()
            {
                return Err("STUDY_STORAGE_FAILED".into());
            }
            let mut remaining = items[entry.item_index].question.as_str();
            let mut completed = String::new();
            for (index, answer) in answers.iter().enumerate() {
                let marker = format!("{{{{{}}}}}", index + 1);
                let (before, after) = remaining
                    .split_once(&marker)
                    .ok_or("STUDY_STORAGE_FAILED")?;
                completed.push_str(before);
                completed.push_str(if answer.is_empty() { "____" } else { answer });
                remaining = after;
            }
            completed.push_str(remaining);
            if completed != entry.answer {
                return Err("STUDY_STORAGE_FAILED".into());
            }
        }
        match (&entry.outcome, &entry.feedback) {
            (Outcome::Timeout | Outcome::Skipped, None) => {}
            (Outcome::Correct | Outcome::Wrong, Some(feedback)) => {
                if feedback.correct != (entry.outcome == Outcome::Correct)
                    || !valid_text(&feedback.summary, 3000)
                    || feedback.blank_results.as_ref().is_some_and(|results| {
                        results.is_empty()
                            || results.len() > 5
                            || results.iter().all(|correct| *correct) != feedback.correct
                    })
                {
                    return Err("STUDY_STORAGE_FAILED".into());
                }
                for findings in [&feedback.strengths, &feedback.gaps, &feedback.corrections] {
                    if findings.len() > 8
                        || findings.iter().any(|finding| {
                            !valid_text(&finding.text, 2000)
                                || finding.sources.is_empty()
                                || finding.sources.len() > 16
                                || finding
                                    .sources
                                    .iter()
                                    .any(|id| uuid::Uuid::parse_str(id).is_err())
                        })
                    {
                        return Err("STUDY_STORAGE_FAILED".into());
                    }
                }
            }
            _ => return Err("STUDY_STORAGE_FAILED".into()),
        }
    }
    Ok(())
}

pub(super) fn validate_progress(
    progress: &Progress,
    items: &[Item],
    kind: &Kind,
) -> Result<(), String> {
    let item_count = items.len();
    validate_reports(progress, items, kind)?;
    let mut seen = std::collections::HashSet::new();
    if progress.items.len() > item_count
        || progress.items.iter().any(|item| {
            item.item_index >= item_count
                || !seen.insert(item.item_index)
                || item.attempts == 0
                || item.attempts > 1_000_000
                || item.correct > item.attempts
                || item.timeouts > item.attempts
                || u64::from(item.correct) + u64::from(item.timeouts) > u64::from(item.attempts)
                || item.last_rating.as_ref().is_some_and(|_| {
                    !matches!(kind, Kind::Flashcards)
                        || matches!(item.last_outcome, Outcome::Timeout | Outcome::Skipped)
                })
                || item.streak > item.attempts
                || item.interval_days > 180
                || item.due_at < item.last_reviewed_at
                || item.due_at > 9_007_199_254_740_991
        })
    {
        return Err("STUDY_STORAGE_FAILED".into());
    }
    Ok(())
}

fn valid_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= maximum
}

fn valid_cloze(item: &Item) -> bool {
    let Some(blanks) = &item.blanks else {
        return false;
    };
    if blanks.is_empty()
        || blanks.len() > 5
        || !valid_text(&item.explanation, 4000)
        || blanks.iter().any(|answers| {
            answers.is_empty()
                || answers.len() > 5
                || answers.iter().any(|answer| !valid_text(answer, 200))
        })
    {
        return false;
    }
    let mut remaining = item.question.as_str();
    let mut completed = String::new();
    let mut visible = String::new();
    for (index, answers) in blanks.iter().enumerate() {
        let marker = format!("{{{{{}}}}}", index + 1);
        let Some((before, after)) = remaining.split_once(&marker) else {
            return false;
        };
        if before.contains("{{") || before.contains("}}") {
            return false;
        }
        visible.push_str(before);
        completed.push_str(before);
        completed.push_str(&answers[0]);
        remaining = after;
    }
    visible.push_str(remaining);
    completed.push_str(remaining);
    !remaining.contains("{{")
        && !remaining.contains("}}")
        && !visible.trim().is_empty()
        && completed == item.answer
}

fn valid_correction(item: &Item) -> bool {
    let Some(segments) = &item.segments else {
        return false;
    };
    if !(3..=16).contains(&segments.len())
        || !valid_text(&item.explanation, 4000)
        || !item.options.is_empty()
        || item.correct_index.is_some()
    {
        return false;
    }
    let mut errors = 0;
    let mut original = String::new();
    let mut corrected = String::new();
    for segment in segments {
        if !valid_text(&segment.text, 1000) {
            return false;
        }
        original.push_str(&segment.text);
        if segment.incorrect {
            errors += 1;
            let Some(correction) = &segment.correction else {
                return false;
            };
            if !valid_text(correction, 1000) || correction.trim() == segment.text.trim() {
                return false;
            }
            corrected.push_str(correction);
        } else {
            if segment.correction.is_some() {
                return false;
            }
            corrected.push_str(&segment.text);
        }
    }
    errors > 0
        && errors < segments.len()
        && original.trim() == item.question
        && corrected.trim() == item.answer
        && valid_text(&item.answer, 8000)
}

pub(super) fn validate(deck: &Deck) -> Result<(), String> {
    let valid = uuid::Uuid::parse_str(&deck.id).is_ok()
        && deck.created_at <= 8_640_000_000_000_000
        && valid_text(&deck.title, 200)
        && deck
            .source_note_id
            .as_ref()
            .is_none_or(|id| uuid::Uuid::parse_str(id).is_ok())
        && !deck.items.is_empty()
        && deck.items.len() <= 30
        && deck.items.iter().all(|item| {
            valid_text(&item.question, 2000)
                && !item.sources.is_empty()
                && item.sources.len() <= 16
                && item
                    .sources
                    .iter()
                    .all(|id| uuid::Uuid::parse_str(id).is_ok())
                && (matches!(deck.kind, Kind::Cloze) || item.blanks.is_none())
                && (matches!(deck.kind, Kind::Correction) || item.segments.is_none())
                && match deck.kind {
                    Kind::Cloze => valid_cloze(item),
                    Kind::Correction => valid_correction(item),
                    Kind::Flashcards | Kind::Written => valid_text(&item.answer, 8000),
                    Kind::Quiz => {
                        item.options.len() == 4
                            && item.options.iter().all(|option| valid_text(option, 1000))
                            && item.correct_index.is_some_and(|index| index < 4)
                            && valid_text(&item.explanation, 4000)
                    }
                }
        });
    if valid {
        if let Some(progress) = &deck.progress {
            validate_progress(progress, &deck.items, &deck.kind)?;
        }
        Ok(())
    } else {
        Err("STUDY_INVALID_RESPONSE".into())
    }
}
