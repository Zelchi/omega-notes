mod storage;
mod validation;
use self::validation::{validate, validate_progress};
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

async fn with_storage<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "STUDY_STORAGE_FAILED")?;
        operation()
    })
    .await
    .map_err(|_| "STUDY_STORAGE_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn read_studies(
    app: AppHandle,
    vault_id: String,
    on_session: Channel<StudyEvent>,
) -> Result<(), String> {
    with_storage(move || {
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
    with_storage(move || storage::read(&app, &vault_id, kind, &study_id)).await
}
#[tauri::command]
pub(crate) async fn save_study(
    app: AppHandle,
    vault_id: String,
    study: Deck,
) -> Result<(), String> {
    with_storage(move || {
        validate(&study)?;
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
    with_storage(move || storage::delete(&app, &vault_id, kind, &study_id)).await
}
#[tauri::command]
pub(crate) async fn save_study_progress(
    app: AppHandle,
    vault_id: String,
    study_id: String,
    kind: Kind,
    progress: Progress,
) -> Result<(), String> {
    with_storage(move || {
        let mut deck = storage::read(&app, &vault_id, kind, &study_id)?;
        validate_progress(&progress, &deck.items, &deck.kind)?;
        deck.progress = Some(progress);
        storage::write(&app, &vault_id, &deck, true)
    })
    .await
}
