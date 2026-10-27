use crate::runtime::{AppContext, Channel};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::{Duration, Instant, UNIX_EPOCH},
};

use super::models::{
    NoteDocument, NoteLibrary, NoteLoadIssue, NoteMediaCatalogItem, NoteSaveResult, NoteSummary,
    StudyNote,
};

use crate::app::{library, runtime};

const MAX_EXTERNAL_CHANGE_ITEMS: usize = 256;
const MAX_EXTERNAL_OBSERVERS: usize = 32;
const EXTERNAL_OBSERVER_TTL_SECONDS: u64 = 300;
const FULL_RECONCILE_SECONDS: u64 = 300;
type ExternalSnapshotChanges = (Vec<String>, Vec<String>, bool);

#[derive(Clone, PartialEq, Eq)]
struct ExternalFileStamp {
    length: u64,
    modified_nanos: u128,
    identity: Option<(u64, u64)>,
    regular: bool,
}

struct ExternalSnapshot {
    directory: PathBuf,
    files: BTreeMap<String, ExternalFileStamp>,
    pending: Option<(String, BTreeMap<String, ExternalFileStamp>, bool)>,
    last_seen: Instant,
    last_full_reconcile: Instant,
}

static EXTERNAL_SNAPSHOTS: LazyLock<Mutex<HashMap<String, ExternalSnapshot>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
struct NoteReadState {
    cancelled: Arc<AtomicBool>,
    active: bool,
    expires_at: Instant,
}

static NOTE_READ_OPERATIONS: LazyLock<Mutex<HashMap<String, NoteReadState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct NoteReadOperation {
    id: Option<String>,
    cancelled: Arc<AtomicBool>,
}

impl Drop for NoteReadOperation {
    fn drop(&mut self) {
        let Some(id) = &self.id else { return };
        if let Ok(mut operations) = NOTE_READ_OPERATIONS.lock() {
            if operations
                .get(id)
                .is_some_and(|value| Arc::ptr_eq(&value.cancelled, &self.cancelled))
            {
                operations.remove(id);
            }
        }
    }
}

fn begin_note_read(operation_id: Option<String>) -> Result<NoteReadOperation, String> {
    let Some(id) = operation_id else {
        return Ok(NoteReadOperation {
            id: None,
            cancelled: Arc::new(AtomicBool::new(false)),
        });
    };
    uuid::Uuid::parse_str(&id).map_err(|_| "NOTE_READ_FAILED".to_string())?;
    let now = Instant::now();
    let mut operations = NOTE_READ_OPERATIONS
        .lock()
        .map_err(|_| "NOTE_READ_FAILED".to_string())?;
    operations.retain(|_, state| state.active || state.expires_at > now);
    let cancelled = if let Some(state) = operations.get_mut(&id) {
        if state.active {
            return Err("NOTE_READ_FAILED".into());
        }
        state.active = true;
        state.cancelled.clone()
    } else {
        let cancelled = Arc::new(AtomicBool::new(false));
        operations.insert(
            id.clone(),
            NoteReadState {
                cancelled: cancelled.clone(),
                active: true,
                expires_at: now + Duration::from_secs(30),
            },
        );
        cancelled
    };
    Ok(NoteReadOperation {
        id: Some(id),
        cancelled,
    })
}

pub(crate) fn cancel_note_read(operation_id: String) -> Result<(), String> {
    uuid::Uuid::parse_str(&operation_id).map_err(|_| "NOTE_READ_FAILED".to_string())?;
    let now = Instant::now();
    let mut operations = NOTE_READ_OPERATIONS
        .lock()
        .map_err(|_| "NOTE_READ_FAILED".to_string())?;
    operations.retain(|_, state| state.active || state.expires_at > now);
    if let Some(state) = operations.get_mut(&operation_id) {
        state.cancelled.store(true, Ordering::Relaxed);
        state.expires_at = now + Duration::from_secs(30);
    } else {
        if operations.len() >= 256 {
            return Err("NOTE_READ_FAILED".into());
        }
        operations.insert(
            operation_id,
            NoteReadState {
                cancelled: Arc::new(AtomicBool::new(true)),
                active: false,
                expires_at: now + Duration::from_secs(30),
            },
        );
    }
    Ok(())
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::Relaxed) {
        Err("NOTE_READ_CANCELLED".into())
    } else {
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteChangeSet {
    pub(crate) full_resync: bool,
    pub(crate) change_token: Option<String>,
    pub(crate) changed_ids: Vec<String>,
    pub(crate) removed_ids: Vec<String>,
    pub(crate) notes: Vec<NoteSummary>,
    pub(crate) issues: Vec<NoteLoadIssue>,
    pub(crate) reference_titles: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub(crate) enum NoteSummaryEvent {
    Item(NoteSummary),
    Complete(NoteSummaryCompletion),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteSummaryCompletion {
    issues: Vec<NoteLoadIssue>,
    reference_titles: std::collections::HashMap<String, String>,
}

fn scan_external_snapshot(
    directory: &Path,
    cancelled: &AtomicBool,
) -> Result<BTreeMap<String, ExternalFileStamp>, String> {
    let entries = std::fs::read_dir(directory).map_err(|_| "NOTE_READ_FAILED")?;
    let mut files = BTreeMap::new();
    for entry in entries {
        check_cancelled(cancelled)?;
        // External files can be renamed while the observer snapshots the directory.
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(modified_nanos) = modified.duration_since(UNIX_EPOCH) else {
            continue;
        };
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            Some((metadata.dev(), metadata.ino()))
        };
        #[cfg(not(unix))]
        let identity = None;
        let Ok(file_name) = entry.file_name().into_string() else {
            continue;
        };
        files.insert(
            file_name,
            ExternalFileStamp {
                length: metadata.len(),
                modified_nanos: modified_nanos.as_nanos(),
                identity,
                regular: metadata.is_file() && !metadata.file_type().is_symlink(),
            },
        );
    }
    Ok(files)
}

fn store_external_snapshot(
    observer_id: &str,
    directory: &Path,
    files: BTreeMap<String, ExternalFileStamp>,
) -> Result<(), String> {
    let now = Instant::now();
    let mut snapshots = EXTERNAL_SNAPSHOTS.lock().map_err(|_| "NOTE_READ_FAILED")?;
    snapshots.retain(|_, snapshot| {
        now.duration_since(snapshot.last_seen).as_secs() < EXTERNAL_OBSERVER_TTL_SECONDS
    });
    if !snapshots.contains_key(observer_id) && snapshots.len() >= MAX_EXTERNAL_OBSERVERS {
        if let Some(oldest) = snapshots
            .iter()
            .min_by_key(|(_, snapshot)| snapshot.last_seen)
            .map(|(id, _)| id.clone())
        {
            snapshots.remove(&oldest);
        }
    }
    snapshots.insert(
        observer_id.to_string(),
        ExternalSnapshot {
            directory: directory.to_path_buf(),
            files,
            pending: None,
            last_seen: now,
            last_full_reconcile: now,
        },
    );
    Ok(())
}

fn external_snapshot_diff(
    observer_id: &str,
    directory: &Path,
    current: &BTreeMap<String, ExternalFileStamp>,
    cancelled: &AtomicBool,
) -> Result<Option<ExternalSnapshotChanges>, String> {
    let now = Instant::now();
    let mut snapshots = EXTERNAL_SNAPSHOTS.lock().map_err(|_| "NOTE_READ_FAILED")?;
    snapshots.retain(|_, snapshot| {
        now.duration_since(snapshot.last_seen).as_secs() < EXTERNAL_OBSERVER_TTL_SECONDS
    });
    let Some(previous) = snapshots.get_mut(observer_id) else {
        return Ok(None);
    };
    if previous.directory != directory {
        return Ok(None);
    }
    previous.last_seen = now;
    let mut changed = Vec::new();
    for (file_name, stamp) in current {
        check_cancelled(cancelled)?;
        if previous.files.get(file_name) != Some(stamp) {
            changed.push(file_name.clone());
        }
    }
    let mut removed = Vec::new();
    for file_name in previous.files.keys() {
        check_cancelled(cancelled)?;
        if !current.contains_key(file_name) {
            removed.push(file_name.clone());
        }
    }
    let reconcile_due =
        now.duration_since(previous.last_full_reconcile).as_secs() >= FULL_RECONCILE_SECONDS;
    Ok(Some((changed, removed, reconcile_due)))
}

fn stage_external_snapshot(
    observer_id: &str,
    directory: &Path,
    files: BTreeMap<String, ExternalFileStamp>,
    full_reconcile: bool,
) -> Result<String, String> {
    let now = Instant::now();
    let token = uuid::Uuid::now_v7().to_string();
    let mut snapshots = EXTERNAL_SNAPSHOTS.lock().map_err(|_| "NOTE_READ_FAILED")?;
    snapshots.retain(|_, snapshot| {
        now.duration_since(snapshot.last_seen).as_secs() < EXTERNAL_OBSERVER_TTL_SECONDS
    });
    if !snapshots.contains_key(observer_id) && snapshots.len() >= MAX_EXTERNAL_OBSERVERS {
        if let Some(oldest) = snapshots
            .iter()
            .min_by_key(|(_, snapshot)| snapshot.last_seen)
            .map(|(id, _)| id.clone())
        {
            snapshots.remove(&oldest);
        }
    }
    let snapshot = snapshots
        .entry(observer_id.to_string())
        .or_insert_with(|| ExternalSnapshot {
            directory: directory.to_path_buf(),
            files: BTreeMap::new(),
            pending: None,
            last_seen: now,
            last_full_reconcile: now,
        });
    if snapshot.directory.as_path() != directory {
        snapshot.directory = directory.to_path_buf();
        snapshot.files.clear();
        snapshot.last_full_reconcile = now;
    }
    snapshot.pending = Some((token.clone(), files, full_reconcile));
    snapshot.last_seen = now;
    Ok(token)
}

fn acknowledge_external_snapshot(observer_id: &str, token: &str) -> Result<(), String> {
    let now = Instant::now();
    let mut snapshots = EXTERNAL_SNAPSHOTS.lock().map_err(|_| "NOTE_READ_FAILED")?;
    let Some(snapshot) = snapshots.get_mut(observer_id) else {
        return Ok(());
    };
    if snapshot
        .pending
        .as_ref()
        .is_some_and(|(pending_token, _, _)| pending_token == token)
    {
        if let Some((_, files, full_reconcile)) = snapshot.pending.take() {
            snapshot.files = files;
            if full_reconcile {
                snapshot.last_full_reconcile = now;
            }
        }
    }
    snapshot.last_seen = now;
    Ok(())
}

fn external_id(file_name: &str) -> Option<String> {
    let id = file_name.strip_suffix(".omega")?;
    super::validate_note_id(id).ok()?;
    Some(id.to_string())
}

pub(crate) async fn list_notes(
    app: AppContext,
    vault_id: Option<String>,
    external: Option<bool>,
) -> Result<NoteLibrary, String> {
    crate::runtime::spawn_blocking(move || {
        let directories = runtime::notes_and_backups_dirs(&app)?;
        let title_lock = library::title_lock_for_vault(&directories.0)?;
        let _title_lock = library::lock_vault_title_operations(&title_lock)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        if let Some(id) = vault_id.as_deref() {
            if crate::ai::terminal_vault_directory(&app, id)
                .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?
                != directories.0
            {
                return Err("NOTE_LOAD_VAULT_MISMATCH".into());
            }
        }
        let library = if external == Some(true) {
            let directory = &directories.0;
            let mut notes = Vec::new();
            for entry in std::fs::read_dir(directory).map_err(|_| "NOTE_READ_FAILED")? {
                let entry = entry.map_err(|_| "NOTE_READ_FAILED")?;
                if entry.path().extension().is_none_or(|ext| ext != "omega") {
                    continue;
                }
                if entry
                    .file_type()
                    .map_err(|_| "NOTE_READ_FAILED")?
                    .is_symlink()
                {
                    return Err("NOTE_READ_FAILED".into());
                }
                notes.push(super::note_from_path(&entry.path()).map_err(|_| "NOTE_READ_FAILED")?);
            }
            let (reference_titles, issues) = super::load_reference_titles(directory);
            NoteLibrary {
                notes,
                issues,
                reference_titles,
            }
        } else {
            library::list_notes(&|| Ok(directories.clone()))?
        };
        if runtime::notes_dir(&app)? != directories.0 {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(library)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn stream_note_summaries(
    app: AppContext,
    vault_id: String,
    observer_id: String,
    reset_observer_snapshot: bool,
    external: Option<bool>,
    operation_id: Option<String>,
    on_item: Channel<NoteSummaryEvent>,
) -> Result<(), String> {
    let operation = begin_note_read(operation_id)?;
    let cancelled = operation.cancelled.clone();
    crate::runtime::spawn_blocking(move || {
        let _operation = operation;
        check_cancelled(&cancelled)?;
        if observer_id.is_empty() || observer_id.len() > 128 {
            return Err("NOTE_READ_FAILED".into());
        }
        let directories = runtime::notes_and_backups_dirs(&app)?;
        if crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?
            != directories.0
        {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        let title_lock = library::title_lock_for_vault(&directories.0)?;
        let _title_lock =
            library::lock_vault_title_operations_cancellable(&title_lock, &cancelled)?;
        check_cancelled(&cancelled)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        if reset_observer_snapshot && external == Some(true) {
            // Observer indexing is advisory and must not block loading note summaries.
            match scan_external_snapshot(&directories.0, &cancelled) {
                Ok(snapshot) => {
                    check_cancelled(&cancelled)?;
                    let _ = store_external_snapshot(&observer_id, &directories.0, snapshot);
                }
                Err(error) if error == "NOTE_READ_CANCELLED" => return Err(error),
                Err(_) => {}
            }
        }
        let (issues, reference_titles) = library::stream_note_summaries_cancellable(
            &|| Ok(directories.clone()),
            &cancelled,
            |note| {
                check_cancelled(&cancelled)?;
                on_item
                    .send(NoteSummaryEvent::Item(note))
                    .map_err(|_| "NOTE_READ_FAILED".to_string())
            },
        )?;
        check_cancelled(&cancelled)?;
        if runtime::notes_dir(&app)? != directories.0 {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        on_item
            .send(NoteSummaryEvent::Complete(NoteSummaryCompletion {
                issues,
                reference_titles,
            }))
            .map_err(|_| "NOTE_READ_FAILED".to_string())
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn notes_changes(
    app: AppContext,
    vault_id: String,
    observer_id: String,
    operation_id: Option<String>,
) -> Result<NoteChangeSet, String> {
    let operation = begin_note_read(operation_id)?;
    let cancelled = operation.cancelled.clone();
    crate::runtime::spawn_blocking(move || {
        let _operation = operation;
        check_cancelled(&cancelled)?;
        if observer_id.is_empty() || observer_id.len() > 128 {
            return Err("NOTE_READ_FAILED".into());
        }
        let directories = runtime::notes_and_backups_dirs(&app)?;
        if crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SCAN_VAULT_CHANGED"))?
            != directories.0
        {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        let title_lock = library::title_lock_for_vault(&directories.0)?;
        let _title_lock =
            library::lock_vault_title_operations_cancellable(&title_lock, &cancelled)?;
        check_cancelled(&cancelled)?;
        if runtime::notes_and_backups_dirs(&app)? != directories {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        let current = scan_external_snapshot(&directories.0, &cancelled)?;
        let Some((changed_files, removed_files, reconcile_due)) =
            external_snapshot_diff(&observer_id, &directories.0, &current, &cancelled)?
        else {
            let change_token =
                stage_external_snapshot(&observer_id, &directories.0, current, true)?;
            return Ok(NoteChangeSet {
                full_resync: true,
                change_token: Some(change_token),
                changed_ids: Vec::new(),
                removed_ids: Vec::new(),
                notes: Vec::new(),
                issues: Vec::new(),
                reference_titles: HashMap::new(),
            });
        };

        if reconcile_due {
            let change_token =
                stage_external_snapshot(&observer_id, &directories.0, current, true)?;
            return Ok(NoteChangeSet {
                full_resync: true,
                change_token: Some(change_token),
                changed_ids: Vec::new(),
                removed_ids: Vec::new(),
                notes: Vec::new(),
                issues: Vec::new(),
                reference_titles: HashMap::new(),
            });
        }

        if changed_files.len().saturating_add(removed_files.len()) > MAX_EXTERNAL_CHANGE_ITEMS {
            let mut changed_ids = Vec::new();
            for file_name in &changed_files {
                check_cancelled(&cancelled)?;
                if let Some(id) = external_id(file_name) {
                    changed_ids.push(id);
                }
            }
            changed_ids.sort();
            let change_token =
                stage_external_snapshot(&observer_id, &directories.0, current, true)?;
            return Ok(NoteChangeSet {
                full_resync: true,
                change_token: Some(change_token),
                changed_ids,
                removed_ids: Vec::new(),
                notes: Vec::new(),
                issues: Vec::new(),
                reference_titles: HashMap::new(),
            });
        }
        let mut changed_ids = Vec::with_capacity(changed_files.len());
        let mut removed_ids = HashSet::new();
        let mut full_resync = false;
        for file_name in changed_files {
            check_cancelled(&cancelled)?;
            if let Some(id) = external_id(&file_name) {
                changed_ids.push(id);
            } else {
                full_resync = true;
            }
        }
        for file_name in removed_files {
            check_cancelled(&cancelled)?;
            if let Some(id) = external_id(&file_name) {
                removed_ids.insert(id);
            } else {
                full_resync = true;
            }
        }
        if full_resync {
            changed_ids.sort();
            let mut removed_ids = removed_ids.into_iter().collect::<Vec<_>>();
            removed_ids.sort();
            let change_token =
                stage_external_snapshot(&observer_id, &directories.0, current, true)?;
            return Ok(NoteChangeSet {
                full_resync: true,
                change_token: Some(change_token),
                changed_ids,
                removed_ids,
                notes: Vec::new(),
                issues: Vec::new(),
                reference_titles: HashMap::new(),
            });
        }
        if changed_ids.is_empty() && removed_ids.is_empty() {
            return Ok(NoteChangeSet {
                full_resync: false,
                change_token: None,
                changed_ids,
                removed_ids: removed_ids.into_iter().collect(),
                notes: Vec::new(),
                issues: Vec::new(),
                reference_titles: HashMap::new(),
            });
        }

        let changed_id_set = changed_ids.iter().cloned().collect::<HashSet<_>>();
        let mut notes = Vec::new();
        let mut emitted = HashSet::new();
        let (issues, reference_titles) = library::stream_note_summaries_cancellable(
            &|| Ok(directories.clone()),
            &cancelled,
            |summary| {
                check_cancelled(&cancelled)?;
                if changed_id_set.contains(&summary.id) {
                    emitted.insert(summary.id.clone());
                    notes.push(summary);
                }
                Ok(())
            },
        )?;
        check_cancelled(&cancelled)?;
        for id in changed_ids.iter().filter(|id| !emitted.contains(*id)) {
            removed_ids.insert(id.clone());
        }
        if runtime::notes_dir(&app)? != directories.0 {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        let change_token = stage_external_snapshot(&observer_id, &directories.0, current, false)?;
        let mut removed_ids = removed_ids.into_iter().collect::<Vec<_>>();
        removed_ids.sort();
        changed_ids.sort();
        Ok(NoteChangeSet {
            full_resync: false,
            change_token: Some(change_token),
            changed_ids,
            removed_ids,
            notes,
            issues,
            reference_titles,
        })
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn acknowledge_note_changes(
    observer_id: String,
    change_token: String,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
        if observer_id.is_empty() || observer_id.len() > 128 {
            return Err("NOTE_READ_FAILED".into());
        }
        acknowledge_external_snapshot(&observer_id, &change_token)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn get_note(
    app: AppContext,
    vault_id: String,
    note_id: String,
    operation_id: Option<String>,
) -> Result<StudyNote, String> {
    let operation = begin_note_read(operation_id)?;
    let cancelled = operation.cancelled.clone();
    crate::runtime::spawn_blocking(move || {
        let _operation = operation;
        check_cancelled(&cancelled)?;
        super::validate_note_id(&note_id).map_err(|_| "NOTE_READ_FAILED")?;
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        let title_lock = library::title_lock_for_vault(&directory)?;
        let _title_lock =
            library::lock_vault_title_operations_cancellable(&title_lock, &cancelled)?;
        check_cancelled(&cancelled)?;
        let path = super::note_path(&directory, &note_id);
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| "NOTE_READ_FAILED")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("NOTE_READ_FAILED".into());
        }
        let note =
            super::note_from_path_with_id(&path, &note_id).map_err(|_| "NOTE_READ_FAILED")?;
        check_cancelled(&cancelled)?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(note)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn list_note_media(app: AppContext) -> Result<Vec<NoteMediaCatalogItem>, String> {
    crate::runtime::spawn_blocking(move || {
        let directory = runtime::notes_dir(&app)?;
        let title_lock = library::title_lock_for_vault(&directory)?;
        let _title_lock = library::lock_vault_title_operations(&title_lock)?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        let catalog = super::list_note_media(&directory)?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(catalog)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn list_deleted_note_ids(
    app: AppContext,
    vault_id: String,
    operation_id: Option<String>,
) -> Result<Vec<String>, String> {
    let operation = begin_note_read(operation_id)?;
    let cancelled = operation.cancelled.clone();
    crate::runtime::spawn_blocking(move || {
        let _operation = operation;
        check_cancelled(&cancelled)?;
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        let title_lock = library::title_lock_for_vault(&directory)?;
        let _title_lock =
            library::lock_vault_title_operations_cancellable(&title_lock, &cancelled)?;
        check_cancelled(&cancelled)?;
        let archive = super::deleted_notes_directory(&directory);
        let metadata = match std::fs::symlink_metadata(&archive) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                check_cancelled(&cancelled)?;
                if runtime::notes_dir(&app)? != directory {
                    return Err("NOTE_LOAD_VAULT_CHANGED".into());
                }
                return Ok(Vec::new());
            }
            Err(_) => return Err("NOTE_READ_FAILED".into()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("NOTE_READ_FAILED".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for entry in std::fs::read_dir(archive).map_err(|_| "NOTE_READ_FAILED")? {
            check_cancelled(&cancelled)?;
            let entry = entry.map_err(|_| "NOTE_READ_FAILED")?;
            if entry
                .path()
                .extension()
                .is_none_or(|extension| extension != "omega")
            {
                continue;
            }
            let file_type = entry.file_type().map_err(|_| "NOTE_READ_FAILED")?;
            if file_type.is_symlink() || !file_type.is_file() {
                return Err("NOTE_READ_FAILED".into());
            }
            let id = entry
                .path()
                .file_stem()
                .and_then(|stem| stem.to_str())
                .ok_or("NOTE_READ_FAILED")?
                .to_string();
            super::validate_note_id(&id).map_err(|_| "NOTE_READ_FAILED")?;
            ids.insert(id);
        }
        check_cancelled(&cancelled)?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(ids.into_iter().collect())
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

#[derive(serde::Deserialize)]
pub(crate) struct ExpectedNote {
    title: String,
    document: NoteDocument,
}

pub(crate) async fn create_note(app: AppContext, note_title: String) -> Result<StudyNote, String> {
    crate::runtime::spawn_blocking(move || {
        let result = library::create_note(&|| runtime::notes_and_backups_dirs(&app), note_title);
        crate::ai::invalidate_tool_cache();
        result
    })
    .await
    .map_err(|_| "NOTE_CREATE_FAILED".to_string())?
}

pub(crate) async fn save_note(
    app: AppContext,
    vault_id: String,
    note_id: String,
    note_title: String,
    document: NoteDocument,
    expected_note: ExpectedNote,
) -> Result<NoteSaveResult, String> {
    crate::runtime::spawn_blocking(move || {
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SAVE_VAULT_CHANGED"))?;
        super::validate_note_id(&note_id)?;
        let path = super::note_path(&directory, &note_id);
        if std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return Err("NOTE_EXTERNAL_CONFLICT".into());
        }
        let stored = std::fs::read_to_string(&path).map_err(|_| "NOTE_EXTERNAL_CONFLICT")?;
        let current = super::note_from_contents(&path, &note_id, &stored)
            .map_err(|_| "NOTE_EXTERNAL_CONFLICT")?;
        if current.title != expected_note.title
            || serde_json::to_value(&current.document).map_err(|_| "NOTE_EXTERNAL_CONFLICT")?
                != serde_json::to_value(&expected_note.document)
                    .map_err(|_| "NOTE_EXTERNAL_CONFLICT")?
        {
            return Err("NOTE_EXTERNAL_CONFLICT".into());
        }
        let result = library::save_note_checked(
            &|| {
                let directories = runtime::notes_and_backups_dirs(&app)?;
                if directories.0 != directory {
                    return Err("NOTE_SAVE_VAULT_CHANGED".into());
                }
                Ok(directories)
            },
            note_id,
            note_title,
            document,
            Some(stored.as_bytes()),
        );
        crate::ai::invalidate_tool_cache();
        result
    })
    .await
    .map_err(|_| "NOTE_SAVE_FAILED".to_string())?
}

pub(crate) async fn rename_note(
    app: AppContext,
    note_id: String,
    note_title: String,
) -> Result<Vec<StudyNote>, String> {
    crate::runtime::spawn_blocking(move || {
        let result = library::rename_note(
            &|| runtime::notes_and_backups_dirs(&app),
            note_id,
            note_title,
        )
        .map_err(rename_error_message);
        crate::ai::invalidate_tool_cache();
        result
    })
    .await
    .map_err(|_| "NOTE_RENAME_FAILED".to_string())?
}

pub(crate) async fn delete_note(
    app: AppContext,
    note_id: String,
) -> Result<Vec<NoteLoadIssue>, String> {
    crate::runtime::spawn_blocking(move || {
        let result = library::delete_note(&|| runtime::notes_and_backups_dirs(&app), note_id);
        crate::ai::invalidate_tool_cache();
        result
    })
    .await
    .map_err(|_| "NOTE_DELETE_FAILED".to_string())?
}

pub(crate) async fn list_deleted_notes(app: AppContext) -> Result<Vec<StudyNote>, String> {
    crate::runtime::spawn_blocking(move || {
        library::list_deleted_notes(&|| runtime::notes_and_backups_dirs(&app))
    })
    .await
    .map_err(|_| "NOTE_TRASH_READ_FAILED".to_string())?
}

pub(crate) async fn restore_deleted_note(
    app: AppContext,
    note_id: String,
) -> Result<NoteSaveResult, String> {
    crate::runtime::spawn_blocking(move || {
        let result =
            library::restore_deleted_note(&|| runtime::notes_and_backups_dirs(&app), note_id);
        crate::ai::invalidate_tool_cache();
        result
    })
    .await
    .map_err(|_| "NOTE_RESTORE_FAILED".to_string())?
}

fn rename_error_message(error: library::RenameNoteError) -> String {
    use library::RenameNoteError;

    match error {
        RenameNoteError::Validation(message)
        | RenameNoteError::Context(message)
        | RenameNoteError::Library(message)
        | RenameNoteError::Snapshot(message) => message,
        RenameNoteError::NotFound => "NOTE_NOT_FOUND".to_string(),
        RenameNoteError::Write(error) => format!("RENAME_FAILED: {error}"),
        RenameNoteError::Rollback {
            write_error,
            rollback_error,
        } => format!(
            "RENAME_ROLLBACK_FAILED: {write_error} A restauração também falhou: {rollback_error}"
        ),
    }
}

fn vault_operation_error(error: String, changed: &str) -> String {
    if error == "AI_VAULT_NOT_ACTIVE" {
        changed.to_string()
    } else {
        error
    }
}

#[cfg(test)]
mod runtime_tests {
    use std::{sync::mpsc, time::Duration};

    #[test]
    fn cancelled_old_vault_worker_does_not_block_switching_and_loading_the_new_vault() {
        let temp = tempfile::tempdir().unwrap();
        let app = crate::runtime::AppContext::new(
            temp.path().join("documents"),
            temp.path().join("cache"),
            Box::new(std::io::sink()),
        );
        crate::app::setup::initialize(app.clone()).unwrap();
        let invoke = |command: &str, args| {
            crate::runtime::block_on(crate::dispatch::dispatch(app.clone(), command.into(), args))
        };
        let first = invoke("create_vault", serde_json::json!({"name": "First"})).unwrap();
        let first_id = first["vaults"][0]["id"].as_str().unwrap();
        let second = invoke("create_vault", serde_json::json!({"name": "Second"})).unwrap();
        let second_id = second["vaults"][1]["id"].as_str().unwrap();
        invoke("switch_vault", serde_json::json!({"vaultId": first_id})).unwrap();
        let directories = crate::app::runtime::notes_and_backups_dirs(&app).unwrap();
        let old_lock = crate::app::library::title_lock_for_vault(&directories.0).unwrap();
        let operation_id = uuid::Uuid::now_v7().to_string();
        let operation = super::begin_note_read(Some(operation_id.clone())).unwrap();
        let worker_lock = old_lock.clone();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _operation = operation;
            let _guard = worker_lock.lock().unwrap();
            started_tx.send(()).unwrap();
            // Keep the old worker and its vault lock alive even after cancellation acknowledgment.
            release_rx.recv().unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        super::cancel_note_read(operation_id).unwrap();
        let context = app.clone();
        let second_id = second_id.to_string();
        let (result_tx, result_rx) = mpsc::channel();
        let loading = crate::runtime::spawn(async move {
            let result = async {
                crate::vaults::commands::switch_vault(context.clone(), second_id.clone()).await?;
                super::stream_note_summaries(
                    context.clone(),
                    second_id,
                    "switch-regression".into(),
                    true,
                    Some(false),
                    Some(uuid::Uuid::now_v7().to_string()),
                    crate::runtime::Channel::from_argument(
                        &context,
                        &serde_json::json!({
                            "onItem": {"__omegaChannel": uuid::Uuid::now_v7().to_string()}
                        }),
                        "onItem",
                    )?,
                )
                .await
            }
            .await;
            result_tx.send(result).unwrap();
        });
        let result = result_rx.recv_timeout(Duration::from_secs(2));
        release_tx.send(()).unwrap();
        worker.join().unwrap();
        crate::runtime::block_on(loading).unwrap();
        result
            .expect("new vault must load before the old vault lock is released")
            .unwrap();
    }

    #[test]
    fn cancel_note_read_marks_the_registered_operation() {
        let operation_id = uuid::Uuid::now_v7().to_string();
        let operation = super::begin_note_read(Some(operation_id.clone())).unwrap();

        super::cancel_note_read(operation_id).unwrap();

        assert!(operation.cancelled.load(super::Ordering::Relaxed));
    }

    #[test]
    fn blocking_worker_does_not_stall_async_tasks() {
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let blocking = crate::runtime::spawn_blocking(move || {
            started_tx.send(()).unwrap();
            release_rx.recv().unwrap();
        });
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("blocking worker should start");

        let responsive = crate::runtime::spawn(async { 42 });
        let value = crate::runtime::block_on(responsive).unwrap();
        release_tx.send(()).unwrap();
        crate::runtime::block_on(blocking).unwrap();

        assert_eq!(value, 42);
    }
}
