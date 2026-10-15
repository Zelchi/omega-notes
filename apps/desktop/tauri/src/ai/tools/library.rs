use crate::{names::normalize_name, notes};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    path::Path,
};

pub(super) struct Library {
    pub notes: Vec<notes::StudyNote>,
    pub unreadable: usize,
}
impl Library {
    pub fn load(directory: &Path) -> Result<Self, String> {
        let (mut paths, errors) = notes::note_paths(directory).map_err(|_| "AI_READ_FAILED")?;
        paths.sort();
        let mut library = Self {
            notes: Vec::new(),
            unreadable: errors.len(),
        };
        for path in paths.iter().filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "omega")
        }) {
            match super::read(path) {
                Ok(note) => library.notes.push(note),
                Err(_) => library.unreadable += 1,
            }
        }
        Ok(library)
    }
}

pub(super) struct Graph {
    pub library: Library,
    pub outgoing: BTreeMap<String, BTreeSet<String>>,
    pub incoming: BTreeMap<String, BTreeSet<String>>,
    pub unresolved: Vec<(String, String)>,
    pub index: HashMap<String, usize>,
}
impl Graph {
    pub fn load(directory: &Path) -> Result<Self, String> {
        let library = Library::load(directory)?;
        let (by_id, by_title) = notes::note_title_indexes(&library.notes);
        let mut graph = Self {
            index: library
                .notes
                .iter()
                .enumerate()
                .map(|(index, note)| (note.id.clone(), index))
                .collect(),
            library,
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
