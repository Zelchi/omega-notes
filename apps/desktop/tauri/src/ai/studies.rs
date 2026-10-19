mod storage;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle};

static STORAGE: Mutex<()> = Mutex::new(());
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Kind {
    Flashcards,
    Quiz,
    Written,
    Cloze,
    Correction,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    question: String,
    answer: String,
    options: Vec<String>,
    correct_index: Option<usize>,
    explanation: String,
    sources: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    blanks: Option<Vec<Vec<String>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    segments: Option<Vec<CorrectionSegment>>,
}
#[derive(Serialize, Deserialize)]
pub(crate) struct CorrectionSegment {
    text: String,
    incorrect: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    correction: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Deck {
    id: String,
    kind: Kind,
    title: String,
    created_at: u64,
    source_note_id: Option<String>,
    items: Vec<Item>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    progress: Option<Progress>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(PartialEq)]
pub(crate) enum Outcome {
    Correct,
    Wrong,
    Timeout,
    Skipped,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemProgress {
    item_index: usize,
    attempts: u32,
    correct: u32,
    timeouts: u32,
    last_outcome: Outcome,
    last_reviewed_at: u64,
    due_at: u64,
    interval_days: u32,
    streak: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_rating: Option<Rating>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Rating {
    Easy,
    Medium,
    Hard,
}
#[derive(Serialize, Deserialize)]
pub(crate) struct Progress {
    items: Vec<ItemProgress>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    responses: Option<Vec<ReportEntry>>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportEntry {
    item_index: usize,
    answer: String,
    outcome: Outcome,
    reviewed_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    feedback: Option<Feedback>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    blank_answers: Option<Vec<String>>,
}
#[derive(Serialize, Deserialize)]
pub(crate) struct Feedback {
    correct: bool,
    summary: String,
    strengths: Vec<Finding>,
    gaps: Vec<Finding>,
    corrections: Vec<Finding>,
    #[serde(
        default,
        rename = "blankResults",
        skip_serializing_if = "Option::is_none"
    )]
    blank_results: Option<Vec<bool>>,
}
#[derive(Serialize, Deserialize)]
pub(crate) struct Finding {
    text: String,
    sources: Vec<String>,
}
fn validate_reports(progress: &Progress, items: &[Item], kind: &Kind) -> Result<(), String> {
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
fn validate_progress(progress: &Progress, items: &[Item], kind: &Kind) -> Result<(), String> {
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
fn validate(deck: &Deck) -> Result<(), String> {
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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summary {
    id: String,
    kind: Kind,
    created_at: u64,
    source_note_id: Option<String>,
    item_count: usize,
    progress: Option<Progress>,
    has_report: bool,
}
fn summarize(mut deck: Deck) -> Summary {
    let has_report = deck.progress.as_ref().is_some_and(|progress| {
        progress
            .responses
            .as_ref()
            .is_some_and(|entries| !entries.is_empty())
    });
    if let Some(progress) = &mut deck.progress {
        progress.responses = None;
    }
    Summary {
        id: deck.id,
        kind: deck.kind,
        created_at: deck.created_at,
        source_note_id: deck.source_note_id,
        item_count: deck.items.len(),
        progress: deck.progress,
        has_report,
    }
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum StudyEvent {
    Session {
        session: Summary,
    },
    InvalidSession {
        id: String,
        #[serde(rename = "studyKind")]
        study_kind: Kind,
    },
    Complete {
        total: usize,
    },
}

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "STUDY_STORAGE_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn read_studies(
    app: AppHandle,
    vault_id: String,
    on_session: Channel<StudyEvent>,
) -> Result<(), String> {
    blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        let total = storage::read_each(&app, &vault_id, |kind, id, deck| {
            on_session
                .send(match deck {
                    Ok(deck) => StudyEvent::Session {
                        session: summarize(deck),
                    },
                    Err(_) => StudyEvent::InvalidSession {
                        id: id.to_string(),
                        study_kind: kind,
                    },
                })
                .map_err(|_| "STUDY_STORAGE_FAILED".to_string())
        })?;
        on_session
            .send(StudyEvent::Complete { total })
            .map_err(|_| "STUDY_STORAGE_FAILED".to_string())
    })
    .await
}
#[tauri::command]
pub(crate) async fn read_study(
    app: AppHandle,
    vault_id: String,
    study_id: String,
    kind: Kind,
) -> Result<Deck, String> {
    blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        storage::read(&app, &vault_id, kind, &study_id)
    })
    .await
}
#[tauri::command]
pub(crate) async fn save_study(
    app: AppHandle,
    vault_id: String,
    study: Deck,
) -> Result<(), String> {
    blocking(move || {
        validate(&study)?;
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        storage::write(&app, &vault_id, &study, false)
    })
    .await
}
#[tauri::command]
pub(crate) async fn delete_study(
    app: AppHandle,
    vault_id: String,
    study_id: String,
    kind: Kind,
) -> Result<(), String> {
    blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        storage::delete(&app, &vault_id, kind, &study_id)
    })
    .await
}
#[tauri::command]
pub(crate) async fn save_study_progress(
    app: AppHandle,
    vault_id: String,
    study_id: String,
    kind: Kind,
    progress: Progress,
) -> Result<(), String> {
    blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        let mut deck = storage::read(&app, &vault_id, kind, &study_id)?;
        validate_progress(&progress, &deck.items, &deck.kind)?;
        deck.progress = Some(progress);
        storage::write(&app, &vault_id, &deck, true)
    })
    .await
}
