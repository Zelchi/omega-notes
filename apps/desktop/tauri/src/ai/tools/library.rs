use crate::{names::normalize_name, notes};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};

const MAX_CACHED_NOTES: usize = 20_000;
const MAX_CACHED_NOTE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_CACHED_GRAPH_REFERENCES: usize = 50_000;

#[derive(Clone, PartialEq, Eq)]
struct NoteFileStamp {
    name: OsString,
    length: u64,
    modified: SystemTime,
    content_hash: [u8; 32],
}

struct Cache {
    directory: PathBuf,
    signature: Vec<NoteFileStamp>,
    library: Arc<Library>,
    graph: Option<Arc<Graph>>,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

pub(crate) fn invalidate_cache() {
    if let Ok(mut cache) = CACHE.lock() {
        *cache = None;
    }
}

fn invalidate_cache_for(directory: &Path) {
    if let Ok(mut cache) = CACHE.lock() {
        if cache
            .as_ref()
            .is_some_and(|cache| cache.directory.as_path() == directory)
        {
            *cache = None;
        }
    }
}

pub(super) struct Library {
    pub notes: Vec<notes::StudyNote>,
    pub unreadable: usize,
}

impl Library {
    pub fn load(directory: &Path) -> Result<Arc<Self>, String> {
        let _title_lock =
            crate::app::library::lock_title_mutations().map_err(|_| "AI_READ_FAILED")?;
        if let Ok(mut cache) = CACHE.lock() {
            if cache
                .as_ref()
                .is_some_and(|cache| cache.directory.as_path() != directory)
            {
                *cache = None;
            }
        }
        let (mut paths, errors) = match notes::note_paths(directory) {
            Ok(result) => result,
            Err(_) => {
                invalidate_cache_for(directory);
                return Err("AI_READ_FAILED".into());
            }
        };
        paths.retain(|path| {
            path.extension()
                .is_some_and(|extension| extension == "omega")
        });
        paths.sort();

        let signature = if errors.is_empty() {
            note_file_signature(&paths)
        } else {
            None
        };
        if let Some(signature) = signature.as_ref() {
            if let Ok(cache) = CACHE.lock() {
                if let Some(cache) = cache.as_ref().filter(|cache| {
                    cache.directory.as_path() == directory
                        && cache.signature.as_slice() == signature.as_slice()
                }) {
                    return Ok(Arc::clone(&cache.library));
                }
            }
        }
        invalidate_cache_for(directory);

        let library = Arc::new(load_uncached(&paths, errors.len()));
        let Some(signature) = signature else {
            invalidate_cache_for(directory);
            return Ok(library);
        };
        let total_bytes = signature
            .iter()
            .fold(0_u64, |total, file| total.saturating_add(file.length));
        if paths.len() > MAX_CACHED_NOTES || total_bytes > MAX_CACHED_NOTE_BYTES {
            invalidate_cache_for(directory);
            return Ok(library);
        }

        if current_note_file_signature(directory).as_ref() == Some(&signature) {
            if let Ok(mut cache) = CACHE.lock() {
                *cache = Some(Cache {
                    directory: directory.to_path_buf(),
                    signature,
                    library: Arc::clone(&library),
                    graph: None,
                });
            }
        }
        Ok(library)
    }
}

fn load_uncached(paths: &[PathBuf], entry_errors: usize) -> Library {
    let mut library = Library {
        notes: Vec::new(),
        unreadable: entry_errors,
    };
    for path in paths {
        match super::read(path) {
            Ok(note) => library.notes.push(note),
            Err(_) => library.unreadable += 1,
        }
    }
    library
}

fn note_file_signature(paths: &[PathBuf]) -> Option<Vec<NoteFileStamp>> {
    if paths.len() > MAX_CACHED_NOTES {
        return None;
    }
    let mut signature = Vec::with_capacity(paths.len());
    let mut total_bytes = 0_u64;
    for path in paths {
        let metadata = std::fs::symlink_metadata(path).ok()?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return None;
        }
        total_bytes = total_bytes.checked_add(metadata.len())?;
        if total_bytes > MAX_CACHED_NOTE_BYTES {
            return None;
        }
        let contents = std::fs::read(path).ok()?;
        if contents.len() as u64 != metadata.len() {
            return None;
        }
        let current_metadata = std::fs::symlink_metadata(path).ok()?;
        if current_metadata.file_type().is_symlink()
            || !current_metadata.is_file()
            || current_metadata.len() != metadata.len()
            || current_metadata.modified().ok()? != metadata.modified().ok()?
        {
            return None;
        }
        signature.push(NoteFileStamp {
            name: path.file_name()?.to_os_string(),
            length: metadata.len(),
            modified: metadata.modified().ok()?,
            content_hash: Sha256::digest(&contents).into(),
        });
    }
    Some(signature)
}

fn current_note_file_signature(directory: &Path) -> Option<Vec<NoteFileStamp>> {
    let (mut paths, errors) = notes::note_paths(directory).ok()?;
    if !errors.is_empty() {
        return None;
    }
    paths.retain(|path| {
        path.extension()
            .is_some_and(|extension| extension == "omega")
    });
    paths.sort();
    note_file_signature(&paths)
}

pub(super) struct Graph {
    pub library: Arc<Library>,
    pub outgoing: BTreeMap<String, BTreeSet<String>>,
    pub incoming: BTreeMap<String, BTreeSet<String>>,
    pub unresolved: Vec<(String, String)>,
    pub index: HashMap<String, usize>,
}

impl Graph {
    pub fn load(directory: &Path) -> Result<Arc<Self>, String> {
        let library = Library::load(directory)?;
        if let Ok(cache) = CACHE.lock() {
            if let Some(graph) = cache.as_ref().and_then(|cache| {
                if cache.directory.as_path() == directory && Arc::ptr_eq(&cache.library, &library) {
                    cache.graph.as_ref().cloned()
                } else {
                    None
                }
            }) {
                return Ok(graph);
            }
        }

        let (by_id, by_title) = notes::note_title_indexes(&library.notes);
        let mut graph = Self {
            index: library
                .notes
                .iter()
                .enumerate()
                .map(|(index, note)| (note.id.clone(), index))
                .collect(),
            library: Arc::clone(&library),
            outgoing: BTreeMap::new(),
            incoming: BTreeMap::new(),
            unresolved: Vec::new(),
        };
        for source in &graph.library.notes {
            let mut targets: Vec<_> = notes::note_reference_targets(&source.document)
                .into_iter()
                .collect();
            targets.sort();
            let mut seen = BTreeSet::new();
            for target in targets {
                let key = normalize_name(&target);
                if !seen.insert(key.clone()) {
                    continue;
                }
                if let Some(id) = by_id.get(&key).or_else(|| by_title.get(&key)) {
                    if id == &source.id {
                        continue;
                    }
                    graph
                        .outgoing
                        .entry(source.id.clone())
                        .or_default()
                        .insert(id.clone());
                    graph
                        .incoming
                        .entry(id.clone())
                        .or_default()
                        .insert(source.id.clone());
                } else {
                    graph.unresolved.push((source.id.clone(), target));
                }
            }
        }
        let graph = Arc::new(graph);
        if graph_is_cacheable(&graph) {
            if let Ok(mut cache) = CACHE.lock() {
                if let Some(cache) = cache.as_mut().filter(|cache| {
                    cache.directory.as_path() == directory && Arc::ptr_eq(&cache.library, &library)
                }) {
                    cache.graph = Some(Arc::clone(&graph));
                }
            }
        }
        Ok(graph)
    }

    pub fn note(&self, id: &str) -> Result<&notes::StudyNote, String> {
        self.index
            .get(id)
            .map(|index| &self.library.notes[*index])
            .ok_or_else(|| "AI_NOTE_NOT_FOUND".into())
    }

    pub fn neighbors(&self, id: &str, directed: bool) -> BTreeSet<String> {
        let mut result = self.outgoing.get(id).cloned().unwrap_or_default();
        if !directed {
            result.extend(self.incoming.get(id).into_iter().flatten().cloned());
        }
        result
    }
}

fn graph_is_cacheable(graph: &Graph) -> bool {
    let resolved_references = graph.outgoing.values().fold(0_usize, |total, targets| {
        total.saturating_add(targets.len())
    });
    resolved_references <= MAX_CACHED_GRAPH_REFERENCES
        && graph.unresolved.len() <= MAX_CACHED_GRAPH_REFERENCES
}
