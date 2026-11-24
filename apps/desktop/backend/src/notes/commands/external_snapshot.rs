use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, LazyLock, Mutex},
    time::{Instant, UNIX_EPOCH},
};

use super::check_cancelled;

const MAX_EXTERNAL_OBSERVERS: usize = 32;
const EXTERNAL_OBSERVER_TTL_SECONDS: u64 = 300;
const FULL_RECONCILE_SECONDS: u64 = 300;
type ExternalSnapshotChanges = (Vec<String>, Vec<String>, bool);

#[derive(Clone, PartialEq, Eq)]
pub(super) struct ExternalFileStamp {
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

pub(super) fn scan_external_snapshot(
    directory: &Path,
    cancelled: &AtomicBool,
) -> Result<BTreeMap<String, ExternalFileStamp>, String> {
    let entries = std::fs::read_dir(directory).map_err(|_| "NOTE_READ_FAILED")?;
    let mut files = BTreeMap::new();
    for entry in entries {
        check_cancelled(cancelled)?;
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

pub(super) fn store_external_snapshot(
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

pub(super) fn external_snapshot_diff(
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

pub(super) fn stage_external_snapshot(
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

pub(super) fn acknowledge_external_snapshot(observer_id: &str, token: &str) -> Result<(), String> {
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

pub(super) fn external_id(file_name: &str) -> Option<String> {
    let id = file_name.strip_suffix(".omega")?;
    crate::notes::validate_note_id(id).ok()?;
    Some(id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn stamp(length: u64) -> ExternalFileStamp {
        ExternalFileStamp {
            length,
            modified_nanos: 1,
            identity: None,
            regular: true,
        }
    }

    fn files(entries: &[(&str, u64)]) -> BTreeMap<String, ExternalFileStamp> {
        entries
            .iter()
            .map(|(name, length)| ((*name).to_owned(), stamp(*length)))
            .collect()
    }

    #[test]
    fn differences_remain_pending_until_the_latest_token_is_acknowledged() {
        let observer = uuid::Uuid::now_v7().to_string();
        let vault = tempfile::tempdir().unwrap();
        let cancelled = AtomicBool::new(false);
        let baseline = files(&[("a.omega", 1), ("b.omega", 1)]);
        let current = files(&[("a.omega", 2), ("c.omega", 1)]);
        store_external_snapshot(&observer, vault.path(), baseline).unwrap();
        let diff = || {
            external_snapshot_diff(&observer, vault.path(), &current, &cancelled)
                .unwrap()
                .unwrap()
        };
        let expected = (
            vec!["a.omega".into(), "c.omega".into()],
            vec!["b.omega".into()],
            false,
        );
        assert_eq!(diff(), expected);
        let stale =
            stage_external_snapshot(&observer, vault.path(), current.clone(), false).unwrap();
        let latest =
            stage_external_snapshot(&observer, vault.path(), current.clone(), false).unwrap();
        assert_ne!(stale, latest);
        acknowledge_external_snapshot(&observer, &stale).unwrap();
        assert_eq!(diff(), expected);
        acknowledge_external_snapshot(&observer, &latest).unwrap();
        assert_eq!(diff(), (vec![], vec![], false));
        acknowledge_external_snapshot(&observer, &latest).unwrap();
        assert_eq!(diff(), (vec![], vec![], false));
    }

    #[test]
    fn observers_and_vault_directories_keep_separate_baselines() {
        let first = uuid::Uuid::now_v7().to_string();
        let second = uuid::Uuid::now_v7().to_string();
        let vault_a = tempfile::tempdir().unwrap();
        let vault_b = tempfile::tempdir().unwrap();
        let cancelled = AtomicBool::new(false);
        let initial = files(&[("a.omega", 1)]);
        let current = files(&[("a.omega", 2)]);
        store_external_snapshot(&first, vault_a.path(), initial.clone()).unwrap();
        store_external_snapshot(&second, vault_a.path(), current.clone()).unwrap();
        assert!(
            external_snapshot_diff(&first, vault_b.path(), &current, &cancelled)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            external_snapshot_diff(&second, vault_a.path(), &current, &cancelled)
                .unwrap()
                .unwrap()
                .0,
            Vec::<String>::new()
        );
        assert_eq!(
            external_snapshot_diff(&first, vault_a.path(), &current, &cancelled)
                .unwrap()
                .unwrap()
                .0,
            vec!["a.omega"]
        );
        let token = stage_external_snapshot(&first, vault_b.path(), current.clone(), true).unwrap();
        acknowledge_external_snapshot(&first, &token).unwrap();
        assert!(
            external_snapshot_diff(&first, vault_a.path(), &initial, &cancelled)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            external_snapshot_diff(&first, vault_b.path(), &current, &cancelled)
                .unwrap()
                .unwrap()
                .0,
            Vec::<String>::new()
        );
    }

    #[test]
    fn cancelled_scan_or_diff_does_not_advance_baseline() {
        let observer = uuid::Uuid::now_v7().to_string();
        let vault = tempfile::tempdir().unwrap();
        std::fs::write(vault.path().join("a.omega"), b"original").unwrap();
        std::fs::write(vault.path().join("ignored.txt"), b"ignored").unwrap();
        let cancelled = AtomicBool::new(false);
        let initial = scan_external_snapshot(vault.path(), &cancelled).unwrap();
        assert_eq!(initial.len(), 1);
        store_external_snapshot(&observer, vault.path(), initial).unwrap();
        std::fs::write(vault.path().join("a.omega"), b"modified and longer").unwrap();
        let current = scan_external_snapshot(vault.path(), &cancelled).unwrap();
        cancelled.store(true, Ordering::Relaxed);
        assert!(
            matches!(scan_external_snapshot(vault.path(), &cancelled), Err(error) if error == "NOTE_READ_CANCELLED")
        );
        assert!(
            matches!(external_snapshot_diff(&observer, vault.path(), &current, &cancelled), Err(error) if error == "NOTE_READ_CANCELLED")
        );
        cancelled.store(false, Ordering::Relaxed);
        assert_eq!(
            external_snapshot_diff(&observer, vault.path(), &current, &cancelled)
                .unwrap()
                .unwrap()
                .0,
            vec!["a.omega"]
        );
    }
}
