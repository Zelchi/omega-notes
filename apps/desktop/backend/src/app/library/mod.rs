use std::sync::{Mutex, MutexGuard};

mod cleanup;
mod loading;
mod mutations;
mod rename;

static TITLE_MUTATION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_title_mutations() -> Result<MutexGuard<'static, ()>, String> {
    TITLE_MUTATION_LOCK
        .lock()
        .map_err(|_| "Não foi possível validar o título da nota.".to_string())
}

pub(crate) use cleanup::{cleanup_orphaned_media, MediaCleanupSummary};
pub(crate) use loading::{
    content_stats_from_index, list_notes, remove_cached_note_summary, stream_note_summaries,
    stream_note_summaries_with_text, update_cached_note_summaries,
};
pub(crate) use mutations::{
    create_note, delete_note, list_deleted_notes, restore_deleted_note, save_note_checked,
};
pub(crate) use rename::{rename_note, RenameNoteError};
