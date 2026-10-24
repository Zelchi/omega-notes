use crate::runtime::{AppContext, Channel};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::{Instant, UNIX_EPOCH},
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

fn scan_external_snapshot(directory: &Path) -> Result<BTreeMap<String, ExternalFileStamp>, String> {
    let entries = std::fs::read_dir(directory).map_err(|_| "NOTE_READ_FAILED")?;
    let mut files = BTreeMap::new();
    for entry in entries {
        let entry = entry.map_err(|_| "NOTE_READ_FAILED")?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| "NOTE_READ_FAILED")?;
        let modified_nanos = metadata
            .modified()
            .map_err(|_| "NOTE_READ_FAILED")?
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "NOTE_READ_FAILED")?
            .as_nanos();
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            Some((metadata.dev(), metadata.ino()))
        };
        #[cfg(not(unix))]
        let identity = None;
        let file_name = entry
            .file_name()
            .into_string()
            .map_err(|_| "NOTE_READ_FAILED")?;
        files.insert(
            file_name,
            ExternalFileStamp {
                length: metadata.len(),
                modified_nanos,
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
    let changed = current
        .iter()
        .filter_map(|(file_name, stamp)| {
            (previous.files.get(file_name) != Some(stamp)).then_some(file_name.clone())
        })
        .collect::<Vec<_>>();
    let removed = previous
        .files
        .keys()
        .filter(|file_name| !current.contains_key(*file_name))
        .cloned()
        .collect::<Vec<_>>();
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
        let _title_lock = library::lock_title_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
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
    _external: Option<bool>,
    on_item: Channel<NoteSummaryEvent>,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
        if observer_id.is_empty() || observer_id.len() > 128 {
            return Err("NOTE_READ_FAILED".into());
        }
        let _title_lock = library::lock_title_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
        if crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?
            != directories.0
        {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        if reset_observer_snapshot {
            let snapshot = scan_external_snapshot(&directories.0)?;
            store_external_snapshot(&observer_id, &directories.0, snapshot)?;
        }
        let (issues, reference_titles) =
            library::stream_note_summaries(&|| Ok(directories.clone()), |note| {
                on_item
                    .send(NoteSummaryEvent::Item(note))
                    .map_err(|_| "NOTE_READ_FAILED".to_string())
            })?;
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
) -> Result<NoteChangeSet, String> {
    crate::runtime::spawn_blocking(move || {
        if observer_id.is_empty() || observer_id.len() > 128 {
            return Err("NOTE_READ_FAILED".into());
        }
        let _title_lock = library::lock_title_mutations()?;
        let directories = runtime::notes_and_backups_dirs(&app)?;
        if crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_SCAN_VAULT_CHANGED"))?
            != directories.0
        {
            return Err("NOTE_LOAD_VAULT_MISMATCH".into());
        }
        let current = scan_external_snapshot(&directories.0)?;
        let Some((changed_files, removed_files, reconcile_due)) =
            external_snapshot_diff(&observer_id, &directories.0, &current)?
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
            let mut changed_ids = changed_files
                .iter()
                .filter_map(|file_name| external_id(file_name))
                .collect::<Vec<_>>();
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
            if let Some(id) = external_id(&file_name) {
                changed_ids.push(id);
            } else {
                full_resync = true;
            }
        }
        for file_name in removed_files {
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
        let (issues, reference_titles) =
            library::stream_note_summaries(&|| Ok(directories.clone()), |summary| {
                if changed_id_set.contains(&summary.id) {
                    emitted.insert(summary.id.clone());
                    notes.push(summary);
                }
                Ok(())
            })?;
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
) -> Result<StudyNote, String> {
    crate::runtime::spawn_blocking(move || {
        let _title_lock = library::lock_title_mutations()?;
        super::validate_note_id(&note_id).map_err(|_| "NOTE_READ_FAILED")?;
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)
            .map_err(|error| vault_operation_error(error, "NOTE_LOAD_VAULT_CHANGED"))?;
        let path = super::note_path(&directory, &note_id);
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| "NOTE_READ_FAILED")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("NOTE_READ_FAILED".into());
        }
        let note =
            super::note_from_path_with_id(&path, &note_id).map_err(|_| "NOTE_READ_FAILED")?;
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
        let _title_lock = library::lock_title_mutations()?;
        let directory = runtime::notes_dir(&app)?;
        let catalog = super::list_note_media(&directory)?;
        if runtime::notes_dir(&app)? != directory {
            return Err("NOTE_LOAD_VAULT_CHANGED".into());
        }
        Ok(catalog)
    })
    .await
    .map_err(|_| "NOTE_READ_FAILED".to_string())?
}

pub(crate) async fn list_deleted_note_ids(app: AppContext) -> Result<Vec<String>, String> {
    crate::runtime::spawn_blocking(move || {
        let _title_lock = library::lock_title_mutations()?;
        let directory = runtime::notes_dir(&app)?;
        let archive = super::deleted_notes_directory(&directory);
        let metadata = match std::fs::symlink_metadata(&archive) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err("NOTE_READ_FAILED".into()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("NOTE_READ_FAILED".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for entry in std::fs::read_dir(archive).map_err(|_| "NOTE_READ_FAILED")? {
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
