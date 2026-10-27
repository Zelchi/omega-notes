use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex, MutexGuard, Weak,
    },
    thread,
    time::Duration,
};

mod cleanup;
mod loading;
mod mutations;
mod rename;

static TITLE_MUTATION_LOCK: Mutex<()> = Mutex::new(());
static VAULT_TITLE_LOCKS: LazyLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub(crate) fn lock_title_mutations() -> Result<MutexGuard<'static, ()>, String> {
    TITLE_MUTATION_LOCK
        .lock()
        .map_err(|_| "Não foi possível validar o título da nota.".to_string())
}

pub(crate) fn title_lock_for_vault(directory: &Path) -> Result<Arc<Mutex<()>>, String> {
    let directory = directory
        .canonicalize()
        .unwrap_or_else(|_| directory.to_path_buf());
    let mut locks = VAULT_TITLE_LOCKS
        .lock()
        .map_err(|_| "Não foi possível acessar a biblioteca.".to_string())?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&directory).and_then(Weak::upgrade) {
        return Ok(lock);
    }

    let lock = Arc::new(Mutex::new(()));
    locks.insert(directory, Arc::downgrade(&lock));
    Ok(lock)
}

pub(crate) fn lock_vault_title_operations<'a>(
    lock: &'a Mutex<()>,
) -> Result<MutexGuard<'a, ()>, String> {
    lock.lock()
        .map_err(|_| "Não foi possível acessar a biblioteca.".to_string())
}

pub(crate) fn lock_vault_title_operations_cancellable<'a>(
    lock: &'a Mutex<()>,
    cancelled: &AtomicBool,
) -> Result<MutexGuard<'a, ()>, String> {
    loop {
        if cancelled.load(Ordering::Relaxed) {
            return Err("NOTE_READ_CANCELLED".into());
        }
        match lock.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err("Não foi possível acessar a biblioteca.".into());
            }
            Err(std::sync::TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(10)),
        }
    }
}

pub(crate) use cleanup::{cleanup_orphaned_media, MediaCleanupSummary};
pub(crate) use loading::{
    content_stats_from_index, list_notes, remove_cached_note_summary, stream_note_summaries,
    stream_note_summaries_cancellable, stream_note_summaries_with_text,
    update_cached_note_summaries,
};
pub(crate) use mutations::{
    create_note, delete_note, list_deleted_notes, restore_deleted_note, save_note_checked,
};
pub(crate) use rename::{rename_note, RenameNoteError};

#[cfg(test)]
mod cancellation_tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    };

    #[test]
    fn cancellation_interrupts_waiting_for_the_vault_lock() {
        let vault = tempfile::tempdir().unwrap();
        let lock = title_lock_for_vault(vault.path()).unwrap();
        let held = lock_vault_title_operations(&lock).unwrap();
        let cancelled = Arc::new(AtomicBool::new(false));
        let worker_cancelled = cancelled.clone();
        let worker_lock = lock.clone();
        let (started_tx, started_rx) = mpsc::channel();
        let (result_tx, result_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            started_tx.send(()).unwrap();
            result_tx
                .send(
                    lock_vault_title_operations_cancellable(&worker_lock, &worker_cancelled)
                        .map(drop),
                )
                .unwrap();
        });

        started_rx.recv().unwrap();
        thread::sleep(Duration::from_millis(30));
        cancelled.store(true, Ordering::Relaxed);
        assert_eq!(
            result_rx
                .recv_timeout(Duration::from_secs(1))
                .unwrap()
                .unwrap_err(),
            "NOTE_READ_CANCELLED"
        );
        drop(held);
        worker.join().unwrap();
    }

    #[test]
    fn different_vault_locks_do_not_block_each_other() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first_lock = title_lock_for_vault(first.path()).unwrap();
        let second_lock = title_lock_for_vault(second.path()).unwrap();
        let _held = lock_vault_title_operations(&first_lock).unwrap();

        assert!(second_lock.try_lock().is_ok());
        assert!(first_lock.try_lock().is_err());
    }
}
