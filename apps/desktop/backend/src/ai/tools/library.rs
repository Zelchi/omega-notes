use crate::{names::normalize_name, notes};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};

const MAX_CACHED_NOTES: usize = 20_000;
const MAX_CACHED_GRAPH_REFERENCES: usize = 50_000;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NoteFileStamp {
    pub(super) name: String,
    pub(super) length: u64,
    pub(super) modified_nanos: u128,
    pub(super) identity: Option<(u64, u64)>,
    pub(super) regular: bool,
}

struct Cache {
    directory: PathBuf,
    signature: Vec<NoteFileStamp>,
    library: Arc<Library>,
    graph: Option<Arc<Graph>>,
    valid: bool,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

pub(crate) fn invalidate_cache() {
    if let Ok(mut cache) = CACHE.lock() {
        if let Some(cache) = cache.as_mut() {
            cache.valid = false;
        }
    }
}

pub(super) struct Library {
    pub notes: Vec<notes::NoteSummary>,
    pub unreadable: usize,
    pub(super) signature: Option<Vec<NoteFileStamp>>,
}

impl Library {
    pub fn load(directory: &Path) -> Result<Arc<Self>, String> {
        Self::load_internal(directory, false)
    }

    pub fn load_for_search(directory: &Path) -> Result<Arc<Self>, String> {
        Self::load_internal(directory, true)
    }

    fn load_internal(directory: &Path, include_search_text: bool) -> Result<Arc<Self>, String> {
        let _title_lock =
            crate::app::library::lock_title_mutations().map_err(|_| "AI_READ_FAILED")?;
        let signature = current_note_file_signature(directory);
        let previous = {
            let mut cache = CACHE.lock().map_err(|_| "AI_READ_FAILED")?;
            if cache
                .as_ref()
                .is_some_and(|cache| cache.directory.as_path() != directory)
            {
                *cache = None;
            }
            if let Some(signature) = signature.as_ref() {
                if let Some(cache) = cache.as_ref().filter(|cache| {
                    cache.valid
                        && cache.directory.as_path() == directory
                        && cache.signature.as_slice() == signature.as_slice()
                }) {
                    return Ok(Arc::clone(&cache.library));
                }
            }
            cache.take()
        };

        let mut library = load_summaries(directory, include_search_text)?;
        let Some(signature) = signature else {
            return Ok(Arc::new(library));
        };
        if signature.len() > MAX_CACHED_NOTES {
            library.signature = Some(signature);
            return Ok(Arc::new(library));
        }

        library.signature = Some(signature.clone());
        let library = Arc::new(library);

        if current_note_file_signature(directory).as_ref() == Some(&signature) {
            let graph = previous
                .filter(|previous| previous.directory.as_path() == directory)
                .and_then(|previous| previous.graph)
                .map(|previous_graph| {
                    Arc::new(Graph::update(&previous_graph, Arc::clone(&library)))
                })
                .filter(|graph| graph_is_cacheable(graph));
            if let Ok(mut cache) = CACHE.lock() {
                *cache = Some(Cache {
                    directory: directory.to_path_buf(),
                    signature,
                    library: Arc::clone(&library),
                    graph,
                    valid: true,
                });
            }
        }
        Ok(library)
    }
}

fn vault_directories(directory: &Path) -> Result<(PathBuf, PathBuf), String> {
    let vault_root = directory.parent().ok_or("AI_READ_FAILED")?;
    let vault_id = vault_root
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("AI_READ_FAILED")?;
    let vaults_directory = vault_root.parent().ok_or("AI_READ_FAILED")?;
    if vaults_directory.file_name().and_then(|name| name.to_str()) != Some("vaults") {
        return Err("AI_READ_FAILED".into());
    }
    let app_directory = vaults_directory.parent().ok_or("AI_READ_FAILED")?;
    Ok((
        directory.to_path_buf(),
        crate::vaults::vault_backups_directory(app_directory, vault_id),
    ))
}

fn load_summaries(directory: &Path, include_search_text: bool) -> Result<Library, String> {
    let directories = vault_directories(directory)?;
    let mut summaries = Vec::new();
    let (issues, _) = if include_search_text {
        let mut preloader = super::search::Preloader::new(directory);
        crate::app::library::stream_note_summaries_with_text(
            &|| Ok(directories.clone()),
            |summary, text| {
                if let Some(text) = text {
                    preloader.store(&summary.id, &text);
                }
                summaries.push(summary);
                Ok(())
            },
        )
    } else {
        crate::app::library::stream_note_summaries(&|| Ok(directories.clone()), |summary| {
            summaries.push(summary);
            Ok(())
        })
    }
    .map_err(|_| "AI_READ_FAILED")?;
    summaries.sort_by(|first, second| first.id.cmp(&second.id));
    let unreadable = issues
        .iter()
        .filter(|issue| {
            !issue.recovered
                && (issue.file_name == "notes"
                    || Path::new(&issue.file_name)
                        .extension()
                        .is_some_and(|extension| extension == "omega"))
        })
        .count();
    Ok(Library {
        notes: summaries,
        unreadable,
        signature: None,
    })
}

pub(super) fn current_note_file_signature(directory: &Path) -> Option<Vec<NoteFileStamp>> {
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

fn note_file_signature(paths: &[PathBuf]) -> Option<Vec<NoteFileStamp>> {
    if paths.len() > MAX_CACHED_NOTES {
        return None;
    }
    let mut signature = Vec::with_capacity(paths.len());
    for path in paths {
        let metadata = std::fs::symlink_metadata(path).ok()?;
        let name = path.file_name()?.to_str()?.to_string();
        let modified_nanos = metadata
            .modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_nanos();
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            Some((metadata.dev(), metadata.ino()))
        };
        #[cfg(not(unix))]
        let identity = None;
        signature.push(NoteFileStamp {
            name,
            length: metadata.len(),
            modified_nanos,
            identity,
            regular: metadata.is_file() && !metadata.file_type().is_symlink(),
        });
    }
    Some(signature)
}

pub(super) struct Graph {
    pub library: Arc<Library>,
    pub outgoing: BTreeMap<String, BTreeSet<String>>,
    pub incoming: BTreeMap<String, BTreeSet<String>>,
    pub unresolved: Vec<(String, String)>,
    pub index: HashMap<String, usize>,
    sources_by_target: HashMap<String, BTreeSet<String>>,
    targets_by_source: HashMap<String, Vec<String>>,
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

        let graph = Arc::new(Self::build(Arc::clone(&library)));
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

    pub fn note(&self, id: &str) -> Result<&notes::NoteSummary, String> {
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

    fn build(library: Arc<Library>) -> Self {
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
            sources_by_target: HashMap::new(),
            targets_by_source: HashMap::new(),
        };
        for source in &library.notes {
            graph.insert_source(source, &by_id, &by_title);
        }
        graph.unresolved.sort();
        graph
    }

    fn update(previous: &Graph, library: Arc<Library>) -> Self {
        let old = previous
            .library
            .notes
            .iter()
            .map(|note| (note.id.as_str(), note))
            .collect::<HashMap<_, _>>();
        let new = library
            .notes
            .iter()
            .map(|note| (note.id.as_str(), note))
            .collect::<HashMap<_, _>>();
        let ids = old
            .keys()
            .chain(new.keys())
            .copied()
            .collect::<HashSet<_>>();
        let mut changed_sources = HashSet::new();
        let mut changed_targets = HashSet::new();
        for id in ids {
            let before = old.get(id).copied();
            let after = new.get(id).copied();
            if before == after {
                continue;
            }
            changed_sources.insert(id.to_string());
            match (before, after) {
                (Some(before), Some(after)) => {
                    if before.title != after.title {
                        changed_targets.insert(normalize_name(&before.title));
                        changed_targets.insert(normalize_name(&after.title));
                    }
                }
                (Some(before), None) => {
                    changed_targets.insert(normalize_name(&before.id));
                    changed_targets.insert(normalize_name(&before.title));
                }
                (None, Some(after)) => {
                    changed_targets.insert(normalize_name(&after.id));
                    changed_targets.insert(normalize_name(&after.title));
                }
                (None, None) => {}
            }
        }
        if changed_sources.is_empty() {
            return previous.clone_with_library(library);
        }

        let mut affected = changed_sources;
        for key in changed_targets {
            if let Some(sources) = previous.sources_by_target.get(&key) {
                affected.extend(sources.iter().cloned());
            }
        }
        if affected.len() > 2_000 || affected.len().saturating_mul(3) > library.notes.len() {
            return Self::build(library);
        }

        let mut graph = previous.clone_with_library(Arc::clone(&library));
        graph.index = library
            .notes
            .iter()
            .enumerate()
            .map(|(index, note)| (note.id.clone(), index))
            .collect();
        let (by_id, by_title) = notes::note_title_indexes(&library.notes);
        let affected = affected.into_iter().collect::<Vec<_>>();
        for id in &affected {
            graph.remove_source(id);
        }
        for id in affected {
            if let Some(index) = graph.index.get(&id) {
                graph.insert_source(&library.notes[*index], &by_id, &by_title);
            }
        }
        graph.unresolved.sort();
        graph
    }

    fn clone_with_library(&self, library: Arc<Library>) -> Self {
        Self {
            library,
            outgoing: self.outgoing.clone(),
            incoming: self.incoming.clone(),
            unresolved: self.unresolved.clone(),
            index: self.index.clone(),
            sources_by_target: self.sources_by_target.clone(),
            targets_by_source: self.targets_by_source.clone(),
        }
    }

    fn insert_source(
        &mut self,
        source: &notes::NoteSummary,
        by_id: &HashMap<String, String>,
        by_title: &HashMap<String, String>,
    ) {
        let mut targets = source.links.clone();
        targets.sort();
        let mut seen = BTreeSet::new();
        let mut target_keys = Vec::new();
        for target in targets {
            let key = normalize_name(&target);
            if !seen.insert(key.clone()) {
                continue;
            }
            target_keys.push(key.clone());
            self.sources_by_target
                .entry(key.clone())
                .or_default()
                .insert(source.id.clone());
            if let Some(id) = by_id.get(&key).or_else(|| by_title.get(&key)) {
                if id == &source.id {
                    continue;
                }
                self.outgoing
                    .entry(source.id.clone())
                    .or_default()
                    .insert(id.clone());
                self.incoming
                    .entry(id.clone())
                    .or_default()
                    .insert(source.id.clone());
            } else {
                self.unresolved.push((source.id.clone(), target));
            }
        }
        self.targets_by_source
            .insert(source.id.clone(), target_keys);
    }

    fn remove_source(&mut self, source_id: &str) {
        if let Some(targets) = self.outgoing.remove(source_id) {
            for target in targets {
                let remove_key = if let Some(sources) = self.incoming.get_mut(&target) {
                    sources.remove(source_id);
                    sources.is_empty()
                } else {
                    false
                };
                if remove_key {
                    self.incoming.remove(&target);
                }
            }
        }
        self.unresolved.retain(|(id, _)| id != source_id);
        if let Some(target_keys) = self.targets_by_source.remove(source_id) {
            for key in target_keys {
                let remove_key = if let Some(sources) = self.sources_by_target.get_mut(&key) {
                    sources.remove(source_id);
                    sources.is_empty()
                } else {
                    false
                };
                if remove_key {
                    self.sources_by_target.remove(&key);
                }
            }
        }
    }
}

fn graph_is_cacheable(graph: &Graph) -> bool {
    let resolved_references = graph.outgoing.values().fold(0_usize, |total, targets| {
        total.saturating_add(targets.len())
    });
    resolved_references <= MAX_CACHED_GRAPH_REFERENCES
        && graph.unresolved.len() <= MAX_CACHED_GRAPH_REFERENCES
}
