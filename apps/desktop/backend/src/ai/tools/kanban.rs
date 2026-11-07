use serde_json::{json, Value};
use std::{collections::HashSet, path::Path};

use crate::vaults::kanban::{AiBoard, Priority, Status};

const COLUMNS: [Status; 5] = [
    Status::Backlog,
    Status::ToDo,
    Status::InProgress,
    Status::Review,
    Status::Finish,
];

fn column_name(status: Status) -> &'static str {
    match status {
        Status::Backlog => "backlog",
        Status::ToDo => "toDo",
        Status::InProgress => "inProgress",
        Status::Review => "review",
        Status::Finish => "finish",
    }
}

fn priority_name(priority: Priority) -> &'static str {
    match priority {
        Priority::None => "none",
        Priority::Low => "low",
        Priority::Medium => "medium",
        Priority::High => "high",
    }
}

fn column_index(status: Status) -> usize {
    COLUMNS
        .iter()
        .position(|column| *column == status)
        .expect("all Kanban statuses are listed")
}

fn display_positions(data: &AiBoard) -> Vec<usize> {
    let mut reserved: [HashSet<usize>; 5] = std::array::from_fn(|_| HashSet::new());
    for item in &data.items {
        if let Some(position) = item.position {
            reserved[column_index(item.status)].insert(position);
        }
    }

    let mut next = [0; 5];
    data.items
        .iter()
        .map(|item| {
            let lane = column_index(item.status);
            if let Some(position) = item.position {
                return position;
            }
            while reserved[lane].contains(&next[lane]) {
                next[lane] += 1;
            }
            let position = next[lane];
            reserved[lane].insert(position);
            next[lane] += 1;
            position
        })
        .collect()
}

pub(super) fn get_board(directory: &Path, args: &Value) -> Result<Value, String> {
    let data = crate::vaults::kanban::read_for_ai(directory)?;
    let column_filter = args["column"].as_str();
    let priority_filter = args["priority"].as_str();
    let offset = super::offset(args);
    let limit = args["limit"].as_u64().unwrap_or(50) as usize;
    let positions = display_positions(&data);

    let mut matching: Vec<_> = data
        .items
        .iter()
        .enumerate()
        .filter(|(_, item)| {
            column_filter.is_none_or(|column| column_name(item.status) == column)
                && priority_filter.is_none_or(|priority| priority_name(item.priority) == priority)
        })
        .collect();
    matching.sort_by_key(|(index, item)| (column_index(item.status), positions[*index], *index));
    let total = matching.len();
    if offset > 0 && offset >= total {
        return Err("AI_OFFSET_OUT_OF_RANGE".into());
    }
    let cards: Vec<_> = matching
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|(_, item)| {
            json!({
                "id": item.id,
                "title": item.title,
                "column": column_name(item.status),
                "priority": priority_name(item.priority),
                "labels": item.labels,
                "dueDate": item.due_date,
                "noteId": item.note_id,
            })
        })
        .collect();
    let end = offset.saturating_add(cards.len());
    let columns: Vec<_> = COLUMNS
        .iter()
        .map(|status| {
            json!({
                "status": column_name(*status),
                "wipLimit": data.wip_limits.get(status),
                "cardCount": data.items.iter().filter(|item| item.status == *status).count(),
            })
        })
        .collect();

    Ok(json!({
        "columns": columns,
        "cards": cards,
        "total": total,
        "offset": offset,
        "limit": limit,
        "nextOffset": (end < total).then_some(end),
    }))
}
