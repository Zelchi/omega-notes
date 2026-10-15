use super::{library::Graph, offset, required_note};
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    path::Path,
};

pub(super) fn list(directory: &Path, args: &Value) -> Result<Value, String> {
    let source = required_note(directory, args, "noteId")?;
    let graph = Graph::load(directory)?;
    graph.note(&source.id)?;
    let direction = args["direction"].as_str().unwrap_or("both");
    let outgoing = graph.outgoing.get(&source.id).cloned().unwrap_or_default();
    let incoming = graph.incoming.get(&source.id).cloned().unwrap_or_default();
    let ids: BTreeSet<_> = match direction {
        "outgoing" => outgoing.clone(),
        "incoming" => incoming.clone(),
        _ => outgoing.union(&incoming).cloned().collect(),
    };
    let total = ids.len();
    let connections: Vec<_> = ids.iter().skip(offset(args)).take(100).map(|id| {
        let note = graph.note(id).expect("resolved graph reference");
        json!({"id":id,"title":note.title,"reference":super::reference(id),"outgoing":outgoing.contains(id),"incoming":incoming.contains(id)})
    }).collect();
    let end = offset(args).saturating_add(connections.len());
    Ok(
        json!({"id":source.id,"title":source.title,"reference":super::reference(&source.id),"direction":direction,"connections":connections,"total":total,
        "nextOffset":(end < total).then_some(end),"unreadableNotes":graph.library.unreadable}),
    )
}
pub(super) fn overview(directory: &Path) -> Result<Value, String> {
    let graph = Graph::load(directory)?;
    let mut unique = BTreeSet::new();
    let mut directed = 0;
    for (source, targets) in &graph.outgoing {
        for target in targets {
            directed += 1;
            unique.insert(if source < target {
                (source, target)
            } else {
                (target, source)
            });
        }
    }
    let isolated = graph
        .library
        .notes
        .iter()
        .filter(|note| {
            !graph.outgoing.contains_key(&note.id) && !graph.incoming.contains_key(&note.id)
        })
        .count();
    Ok(
        json!({"noteCount":graph.library.notes.len(),"directedReferences":directed,"connectionCount":unique.len(),
        "isolatedNoteCount":isolated,"unresolvedLinkCount":graph.unresolved.len(),"unreadableNotes":graph.library.unreadable}),
    )
}
pub(super) fn unresolved(directory: &Path, args: &Value) -> Result<Value, String> {
    let source = if args.get("noteId").is_some() {
        Some(required_note(directory, args, "noteId")?)
    } else {
        None
    };
    let graph = Graph::load(directory)?;
    let unresolved: Vec<_> = graph
        .unresolved
        .iter()
        .filter(|(id, _)| source.as_ref().is_none_or(|source| &source.id == id))
        .collect();
    let links: Vec<_> = unresolved
        .iter()
        .skip(offset(args))
        .take(100)
        .map(|(id, target)| {
            let note = graph.note(id).expect("unresolved reference source");
            json!({"sourceId":id,"sourceTitle":note.title,"sourceReference":super::reference(id),"target":target.chars().take(600).collect::<String>(),"targetTruncated":target.chars().count() > 600})
        })
        .collect();
    let end = offset(args).saturating_add(links.len());
    Ok(
        json!({"links":links,"total":unresolved.len(),"nextOffset":(end < unresolved.len()).then_some(end),"unreadableNotes":graph.library.unreadable}),
    )
}
pub(super) fn path(directory: &Path, args: &Value) -> Result<Value, String> {
    let source = required_note(directory, args, "sourceId")?;
    let target = required_note(directory, args, "targetId")?;
    let graph = Graph::load(directory)?;
    graph.note(&source.id)?;
    graph.note(&target.id)?;
    let max_depth = args["maxDepth"].as_u64().unwrap_or(12) as usize;
    let directed = args["direction"] == "outgoing";
    let mut queue = VecDeque::from([(source.id.clone(), 0)]);
    let mut parents: HashMap<String, Option<String>> = HashMap::from([(source.id.clone(), None)]);
    let mut depth_limited = false;
    while let Some((id, depth)) = queue.pop_front() {
        if id == target.id {
            let mut path = vec![id];
            while let Some(Some(parent)) = parents.get(path.last().unwrap()) {
                path.push(parent.clone());
            }
            path.reverse();
            let notes: Vec<_> = path
                .iter()
                .map(
                    |id| json!({"id":id,"title":graph.note(id).expect("visited graph node").title,"reference":super::reference(id)}),
                )
                .collect();
            return Ok(
                json!({"found":true,"path":notes,"distance":path.len()-1,"depthLimited":false,"unreadableNotes":graph.library.unreadable}),
            );
        }
        for neighbor in graph.neighbors(&id, directed) {
            if parents.contains_key(&neighbor) {
                continue;
            }
            if depth == max_depth {
                depth_limited = true;
                continue;
            }
            parents.insert(neighbor.clone(), Some(id.clone()));
            queue.push_back((neighbor, depth + 1));
        }
    }
    Ok(
        json!({"found":false,"path":[],"distance":null,"depthLimited":depth_limited,"unreadableNotes":graph.library.unreadable}),
    )
}
