use super::library::{Library, NoteFileStamp};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const INDEX_DIRECTORY: &str = ".ai-search-index";
const INDEX_VERSION: u8 = 1;
const MAX_INDEX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_INDEX_DIRECTORY_BYTES: u64 = 128 * 1024 * 1024;
const MAX_INDEXED_NOTE_BYTES: usize = 8 * 1024 * 1024;
const MAX_INDEXED_NOTE_CHARACTERS: usize = 64_000;
const MAX_MEMORY_INDEX_BYTES: usize = 128 * 1024 * 1024;
const MAX_POSTING_PAIRS: usize = 500_000;

static CACHE: Mutex<Option<SearchCache>> = Mutex::new(None);

pub(super) struct SearchCache {
    directory: PathBuf,
    signature: Vec<NoteFileStamp>,
    entries: HashMap<String, SearchEntry>,
    postings: HashMap<String, Vec<String>>,
    posting_pairs: usize,
    memory_bytes: usize,
}

struct SearchEntry {
    stamp: NoteFileStamp,
    state: EntryState,
}

enum EntryState {
    NoText,
    TooLarge,
    Cached(IndexedText),
}

struct IndexedText {
    original: String,
    folded: String,
    grams: Option<Vec<String>>,
    memory_bytes: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedEntry {
    version: u8,
    id: String,
    stamp: NoteFileStamp,
    text: Option<String>,
    #[serde(default)]
    too_large: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedEntryRef<'a> {
    version: u8,
    id: &'a str,
    stamp: &'a NoteFileStamp,
    text: Option<&'a str>,
    too_large: bool,
}

pub(super) struct SearchMatch {
    pub snippet: String,
    pub snippet_offset: usize,
    pub match_offset: usize,
}

pub(super) struct Preloader {
    directory: PathBuf,
    index_directory: Option<PathBuf>,
    persisted_bytes: u64,
}

impl Preloader {
    pub(super) fn new(directory: &Path) -> Self {
        let index_directory = ensure_index_directory(directory);
        let persisted_bytes = index_directory
            .as_deref()
            .map(index_directory_bytes)
            .unwrap_or_default();
        Self {
            directory: directory.to_path_buf(),
            index_directory,
            persisted_bytes,
        }
    }

    pub(super) fn store(&mut self, id: &str, text: &str) {
        if super::notes::validate_note_id(id).is_err() {
            return;
        }
        let (Some(index_directory), Some(stamp)) = (
            self.index_directory.as_deref(),
            stamp_for_path(&self.directory.join(format!("{id}.omega"))),
        ) else {
            return;
        };
        if !stamp.regular {
            return;
        }
        let mut bytes = serialize_entry(
            id,
            &stamp,
            (text.len() <= MAX_INDEXED_NOTE_BYTES).then_some(text),
            text.len() > MAX_INDEXED_NOTE_BYTES,
        );
        if bytes
            .as_ref()
            .is_none_or(|bytes| bytes.len() as u64 > MAX_INDEX_FILE_BYTES)
        {
            bytes = serialize_entry(id, &stamp, None, true);
        }
        if let Some(bytes) = bytes {
            write_index_bytes(index_directory, id, &bytes, &mut self.persisted_bytes);
        }
    }
}

pub(super) fn with_index<T>(
    directory: &Path,
    library: &Library,
    operation: impl FnOnce(&SearchCache) -> Result<T, String>,
) -> Result<T, String> {
    let signature = library.signature.as_ref().ok_or("AI_READ_FAILED")?;
    let _title_lock = crate::app::library::lock_title_mutations().map_err(|_| "AI_READ_FAILED")?;
    let mut cached = CACHE.lock().map_err(|_| "AI_READ_FAILED")?;

    if cached
        .as_ref()
        .is_none_or(|cache| cache.directory.as_path() != directory || cache.signature != *signature)
    {
        reconcile_cache(&mut cached, directory, signature)?;
    }

    if super::library::current_note_file_signature(directory).as_ref() != Some(signature) {
        *cached = None;
        return Err("AI_READ_FAILED".into());
    }
    let cache = cached.as_ref().ok_or("AI_READ_FAILED")?;
    operation(cache)
}

fn reconcile_cache(
    cache: &mut Option<SearchCache>,
    directory: &Path,
    signature: &[NoteFileStamp],
) -> Result<(), String> {
    if cache
        .as_ref()
        .is_none_or(|current| current.directory.as_path() != directory)
    {
        *cache = Some(SearchCache {
            directory: directory.to_path_buf(),
            signature: Vec::new(),
            entries: HashMap::new(),
            postings: HashMap::new(),
            posting_pairs: 0,
            memory_bytes: 0,
        });
    }
    {
        let current = cache.as_mut().ok_or("AI_READ_FAILED")?;
        let expected = signature
            .iter()
            .filter_map(|stamp| note_id_from_filename(&stamp.name).map(|id| (id, stamp)))
            .collect::<HashMap<_, _>>();
        let deleted = current
            .entries
            .iter()
            .filter_map(|(id, _)| (!expected.contains_key(id.as_str())).then_some(id.clone()))
            .collect::<Vec<_>>();
        for id in deleted {
            current.remove_entry(&id);
            remove_persisted_entry(directory, &id);
        }
        let changed = current
            .entries
            .iter()
            .filter_map(|(id, entry)| {
                expected
                    .get(id.as_str())
                    .is_some_and(|stamp| *stamp != &entry.stamp)
                    .then_some(id.clone())
            })
            .collect::<Vec<_>>();
        for id in changed {
            current.remove_entry(&id);
        }

        let index_directory = ensure_index_directory(directory);
        let mut persisted_bytes = index_directory
            .as_deref()
            .map(index_directory_bytes)
            .unwrap_or_default();
        for stamp in signature {
            let Some(id) = note_id_from_filename(&stamp.name) else {
                continue;
            };
            if !stamp.regular {
                continue;
            }
            if current
                .entries
                .get(&id)
                .is_some_and(|entry| entry.stamp == *stamp)
            {
                continue;
            }

            let persisted = index_directory
                .as_deref()
                .and_then(|path| read_persisted_entry(path, &id, stamp));
            let (state, persist) = match persisted {
                Some(entry) if entry.too_large => (EntryState::TooLarge, false),
                Some(entry) => match entry.text {
                    Some(text) => {
                        let state = current.make_state(text);
                        let rewrite = matches!(&state, EntryState::TooLarge);
                        (state, rewrite)
                    }
                    None => (EntryState::NoText, false),
                },
                None => {
                    let note_path = directory.join(&stamp.name);
                    if stamp_for_path(&note_path).as_ref() != Some(stamp) {
                        return Err("AI_READ_FAILED".into());
                    }
                    let text = super::read(&note_path).ok().map(|note| super::text(&note));
                    if stamp_for_path(&note_path).as_ref() != Some(stamp) {
                        return Err("AI_READ_FAILED".into());
                    }
                    match text {
                        Some(text) => (current.make_state(text), true),
                        None => (EntryState::NoText, true),
                    }
                }
            };
            current.insert_entry(id.clone(), stamp.clone(), state);
            if persist {
                if let Some(index_directory) = index_directory.as_deref() {
                    write_persisted_entry(
                        index_directory,
                        &id,
                        current.entries.get(&id).unwrap(),
                        &mut persisted_bytes,
                    );
                }
            }
        }
    }

    if let Some(signature_after) = super::library::current_note_file_signature(directory) {
        if signature_after != signature {
            *cache = None;
            return Err("AI_READ_FAILED".into());
        }
    } else {
        *cache = None;
        return Err("AI_READ_FAILED".into());
    }
    cache.as_mut().ok_or("AI_READ_FAILED")?.signature = signature.to_vec();
    Ok(())
}

impl SearchCache {
    fn make_state(&mut self, text: String) -> EntryState {
        if text.len() > MAX_INDEXED_NOTE_BYTES
            || self.memory_bytes.saturating_add(text.len()) > MAX_MEMORY_INDEX_BYTES
        {
            return EntryState::TooLarge;
        }
        let folded = text.to_lowercase();
        let memory_bytes = text.len().saturating_add(folded.len());
        if self.memory_bytes.saturating_add(memory_bytes) > MAX_MEMORY_INDEX_BYTES {
            return EntryState::TooLarge;
        }
        let unique_grams = if folded.chars().count() <= MAX_INDEXED_NOTE_CHARACTERS {
            Some(grams(&folded))
        } else {
            None
        };
        let grams = unique_grams.and_then(|grams| {
            if self.posting_pairs.saturating_add(grams.len()) <= MAX_POSTING_PAIRS {
                self.posting_pairs = self.posting_pairs.saturating_add(grams.len());
                Some(grams)
            } else {
                None
            }
        });
        let indexed = grams.is_some();
        self.memory_bytes = self.memory_bytes.saturating_add(memory_bytes);
        EntryState::Cached(IndexedText {
            original: text,
            folded,
            grams: indexed.then_some(grams.unwrap_or_default()),
            memory_bytes,
        })
    }

    fn insert_entry(&mut self, id: String, stamp: NoteFileStamp, state: EntryState) {
        if let EntryState::Cached(IndexedText {
            grams: Some(grams), ..
        }) = &state
        {
            for gram in grams {
                let posting = self.postings.entry(gram.clone()).or_default();
                if posting.last().is_none_or(|previous| previous != &id) {
                    posting.push(id.clone());
                }
            }
        }
        self.entries.insert(id, SearchEntry { stamp, state });
    }

    fn remove_entry(&mut self, id: &str) {
        let Some(entry) = self.entries.remove(id) else {
            return;
        };
        if let EntryState::Cached(indexed) = entry.state {
            self.memory_bytes = self.memory_bytes.saturating_sub(indexed.memory_bytes);
            if let Some(grams) = indexed.grams {
                for gram in grams {
                    let remove_posting = if let Some(posting) = self.postings.get_mut(&gram) {
                        let before = posting.len();
                        posting.retain(|candidate| candidate != id);
                        self.posting_pairs = self
                            .posting_pairs
                            .saturating_sub(before.saturating_sub(posting.len()));
                        posting.is_empty()
                    } else {
                        false
                    };
                    if remove_posting {
                        self.postings.remove(&gram);
                    }
                }
            }
        }
    }

    pub(super) fn matching(&self, query: &str) -> Result<HashMap<String, SearchMatch>, String> {
        let folded_query = query.to_lowercase();
        let query_grams = grams(&folded_query);
        let rarest = query_grams
            .iter()
            .filter_map(|gram| self.postings.get(gram).map(|posting| (gram, posting)))
            .min_by_key(|(_, posting)| posting.len());
        let mut candidate_ids = rarest
            .map(|(_, posting)| posting.iter().cloned().collect::<HashSet<_>>())
            .unwrap_or_default();
        for (id, entry) in &self.entries {
            if matches!(&entry.state, EntryState::TooLarge)
                || matches!(&entry.state, EntryState::Cached(indexed) if indexed.grams.is_none())
            {
                candidate_ids.insert(id.clone());
            }
        }

        let mut matches = HashMap::new();
        for id in candidate_ids {
            let Some(entry) = self.entries.get(&id) else {
                continue;
            };
            let matched = match &entry.state {
                EntryState::Cached(indexed) => match indexed.folded.find(&folded_query) {
                    Some(byte) => Some(make_match(&indexed.original, &indexed.folded, byte)),
                    None => None,
                },
                EntryState::TooLarge => {
                    let path = self.directory.join(&entry.stamp.name);
                    let note = match super::read(&path) {
                        Ok(note) if note.id == id => note,
                        _ => continue,
                    };
                    let text = super::text(&note);
                    let folded = text.to_lowercase();
                    folded
                        .find(&folded_query)
                        .map(|byte| make_match(&text, &folded, byte))
                }
                EntryState::NoText => None,
            };
            if let Some(matched) = matched {
                matches.insert(id, matched);
            }
        }
        Ok(matches)
    }
}

fn grams(text: &str) -> Vec<String> {
    let characters = text.chars().collect::<Vec<_>>();
    if characters.is_empty() {
        return Vec::new();
    }
    let window = characters.len().min(3);
    let mut unique = HashSet::new();
    for start in 0..=characters.len() - window {
        unique.insert(characters[start..start + window].iter().copied().collect());
    }
    unique.into_iter().collect()
}

fn make_match(original: &str, folded: &str, byte_offset: usize) -> SearchMatch {
    let folded_char_offset = folded[..byte_offset].chars().count();
    let mut folded_index = 0;
    let mut match_offset = original.chars().count();
    for (original_index, character) in original.chars().enumerate() {
        if folded_index >= folded_char_offset {
            match_offset = original_index;
            break;
        }
        let folded_length = character.to_lowercase().count();
        if folded_index.saturating_add(folded_length) > folded_char_offset {
            match_offset = original_index;
            break;
        }
        folded_index = folded_index.saturating_add(folded_length);
    }
    let snippet_offset = match_offset.saturating_sub(120);
    let snippet = original.chars().skip(snippet_offset).take(600).collect();
    SearchMatch {
        snippet,
        snippet_offset,
        match_offset,
    }
}

fn note_id_from_filename(file_name: &str) -> Option<String> {
    let id = file_name.strip_suffix(".omega")?;
    super::notes::validate_note_id(id).ok()?;
    Some(id.to_string())
}

fn index_directory(directory: &Path) -> Option<PathBuf> {
    let path = directory.join(INDEX_DIRECTORY);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Some(path),
        _ => None,
    }
}

fn ensure_index_directory(directory: &Path) -> Option<PathBuf> {
    if let Some(path) = index_directory(directory) {
        return Some(path);
    }
    let path = directory.join(INDEX_DIRECTORY);
    if fs::symlink_metadata(&path).is_ok() {
        return None;
    }
    fs::create_dir(&path).ok()?;
    index_directory(directory)
}

fn persisted_path(directory: &Path, id: &str) -> PathBuf {
    directory.join(format!("{id}.json"))
}

fn read_persisted_entry(
    directory: &Path,
    id: &str,
    stamp: &NoteFileStamp,
) -> Option<PersistedEntry> {
    let path = persisted_path(directory, id);
    let metadata = fs::symlink_metadata(&path).ok()?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_INDEX_FILE_BYTES
    {
        return None;
    }
    let entry: PersistedEntry = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if entry.version != INDEX_VERSION
        || entry.id != id
        || entry.stamp != *stamp
        || entry.too_large && entry.text.is_some()
        || entry
            .text
            .as_ref()
            .is_some_and(|text| text.len() > MAX_INDEX_FILE_BYTES as usize)
    {
        return None;
    }
    Some(entry)
}

fn write_persisted_entry(
    directory: &Path,
    id: &str,
    entry: &SearchEntry,
    persisted_bytes: &mut u64,
) {
    let (text, too_large) = match &entry.state {
        EntryState::NoText => (None, false),
        EntryState::TooLarge => (None, true),
        EntryState::Cached(indexed) => (Some(indexed.original.as_str()), false),
    };
    let mut bytes = serialize_entry(id, &entry.stamp, text, too_large);
    if bytes
        .as_ref()
        .is_none_or(|bytes| bytes.len() as u64 > MAX_INDEX_FILE_BYTES)
    {
        bytes = serialize_entry(id, &entry.stamp, None, true);
    }
    if let Some(bytes) = bytes {
        write_index_bytes(directory, id, &bytes, persisted_bytes);
    }
}

fn serialize_entry(
    id: &str,
    stamp: &NoteFileStamp,
    text: Option<&str>,
    too_large: bool,
) -> Option<Vec<u8>> {
    let persisted = PersistedEntryRef {
        version: INDEX_VERSION,
        id,
        stamp,
        text,
        too_large,
    };
    serde_json::to_vec(&persisted).ok()
}

fn write_index_bytes(directory: &Path, id: &str, bytes: &[u8], persisted_bytes: &mut u64) {
    let Some(parent) = directory.parent() else {
        return;
    };
    if index_directory(parent).as_deref() != Some(directory)
        || bytes.len() as u64 > MAX_INDEX_FILE_BYTES
    {
        return;
    }
    let path = persisted_path(directory, id);
    let existing_length = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata.len(),
        Ok(_) => return,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(_) => return,
    };
    let next_total = (*persisted_bytes)
        .saturating_sub(existing_length)
        .saturating_add(bytes.len() as u64);
    if next_total > MAX_INDEX_DIRECTORY_BYTES {
        return;
    }
    if crate::storage::atomic_write(&path, bytes, None).is_ok() {
        *persisted_bytes = next_total;
    }
}

fn index_directory_bytes(directory: &Path) -> u64 {
    let Some(parent) = directory.parent() else {
        return 0;
    };
    if index_directory(parent).as_deref() != Some(directory) {
        return 0;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = fs::symlink_metadata(entry.path()).ok()?;
            (metadata.is_file() && !metadata.file_type().is_symlink()).then_some(metadata.len())
        })
        .fold(0, u64::saturating_add)
}

fn remove_persisted_entry(directory: &Path, id: &str) {
    let Some(directory) = index_directory(directory) else {
        return;
    };
    let path = persisted_path(&directory, id);
    if fs::symlink_metadata(&path)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
    {
        let _ = fs::remove_file(path);
    }
}

fn stamp_for_path(path: &Path) -> Option<NoteFileStamp> {
    let metadata = fs::symlink_metadata(path).ok()?;
    let name = path.file_name()?.to_str()?.to_string();
    let modified_nanos = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos();
    #[cfg(unix)]
    let identity = {
        use std::os::unix::fs::MetadataExt;
        Some((metadata.dev(), metadata.ino()))
    };
    #[cfg(not(unix))]
    let identity = None;
    Some(NoteFileStamp {
        name,
        length: metadata.len(),
        modified_nanos,
        identity,
        regular: metadata.is_file() && !metadata.file_type().is_symlink(),
    })
}
