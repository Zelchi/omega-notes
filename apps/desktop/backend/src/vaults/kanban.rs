use crate::runtime::AppContext;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const FILE_NAME: &str = ".kanban.json";
const MAX_ITEMS: usize = 1000;
const MAX_BYTES: u64 = 4_000_000;
const MAX_DATE_TIMESTAMP: u64 = 8_640_000_000_000_000;
static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Status {
    Backlog,
    ToDo,
    InProgress,
    Review,
    Finish,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    id: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note_id: Option<String>,
    status: Status,
    #[serde(default)]
    position: Option<usize>,
    #[serde(default)]
    created_at: Option<u64>,
    #[serde(default)]
    updated_at: Option<u64>,
    #[serde(default)]
    priority: Priority,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    due_date: Option<String>,
}

pub(crate) type WipLimits = HashMap<Status, usize>;

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanData {
    pub(crate) items: Vec<Item>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub(crate) wip_limits: WipLimits,
}

pub(crate) struct AiItem {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) note_id: Option<String>,
    pub(crate) status: Status,
    pub(crate) position: Option<usize>,
    pub(crate) priority: Priority,
    pub(crate) labels: Vec<String>,
    pub(crate) due_date: Option<String>,
}

pub(crate) struct AiBoard {
    pub(crate) items: Vec<AiItem>,
    pub(crate) wip_limits: WipLimits,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum StoredKanban {
    Current(KanbanData),
    Legacy(Vec<Item>),
}

fn file_path_for_root(root: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(&root).map_err(|_| "KANBAN_STORAGE_FAILED")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let path = root.join(FILE_NAME);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("KANBAN_STORAGE_FAILED".into()),
    }
    Ok(path)
}

fn file_path(app: &AppContext, vault_id: &str) -> Result<PathBuf, String> {
    let directory = crate::app::runtime::app_directory(app)?;
    let registry = crate::vaults::read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or("KANBAN_STORAGE_FAILED")?;
    let root = crate::vaults::vault_directory(&directory, vault)?;
    file_path_for_root(&root)
}

fn read_path(path: PathBuf) -> Result<KanbanData, String> {
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(KanbanData::default())
        }
        Err(_) => return Err("KANBAN_STORAGE_FAILED".into()),
    };
    if metadata.len() > MAX_BYTES {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let stored: StoredKanban =
        serde_json::from_slice(&fs::read(path).map_err(|_| "KANBAN_STORAGE_FAILED")?)
            .map_err(|_| "KANBAN_STORAGE_FAILED")?;
    let data = match stored {
        StoredKanban::Current(data) => data,
        StoredKanban::Legacy(items) => KanbanData {
            items,
            wip_limits: WipLimits::new(),
        },
    };
    validate(&data.items)?;
    validate_wip_limits(&data.wip_limits)?;
    Ok(data)
}

fn read(app: &AppContext, vault_id: &str) -> Result<KanbanData, String> {
    read_path(file_path(app, vault_id)?)
}

pub(crate) fn read_for_ai(notes_directory: &Path) -> Result<AiBoard, String> {
    let _guard = STORAGE.lock().map_err(|_| "KANBAN_STORAGE_FAILED")?;
    let notes_metadata =
        fs::symlink_metadata(notes_directory).map_err(|_| "KANBAN_STORAGE_FAILED")?;
    if !notes_metadata.is_dir()
        || notes_metadata.file_type().is_symlink()
        || notes_directory.file_name().and_then(|name| name.to_str()) != Some("notes")
    {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let root = notes_directory.parent().ok_or("KANBAN_STORAGE_FAILED")?;
    let data = read_path(file_path_for_root(root)?)?;
    Ok(AiBoard {
        items: data
            .items
            .into_iter()
            .map(|item| AiItem {
                id: item.id,
                title: item.title,
                note_id: item.note_id,
                status: item.status,
                position: item.position,
                priority: item.priority,
                labels: item.labels,
                due_date: item.due_date,
            })
            .collect(),
        wip_limits: data.wip_limits,
    })
}

fn validate_wip_limits(limits: &WipLimits) -> Result<(), String> {
    if limits
        .values()
        .any(|limit| *limit == 0 || *limit > MAX_ITEMS)
    {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    Ok(())
}

fn validate(items: &[Item]) -> Result<(), String> {
    if items.len() > MAX_ITEMS {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        let id = uuid::Uuid::parse_str(&item.id).map_err(|_| "KANBAN_STORAGE_FAILED")?;
        if id.to_string() != item.id
            || !ids.insert(item.id.as_str())
            || item.title.trim().is_empty()
            || item.title.chars().count() > 500
            || item.description.chars().count() > 5000
            || item.note_id.as_deref().is_some_and(|note_id| {
                uuid::Uuid::parse_str(note_id).map_or(true, |id| id.to_string() != note_id)
            })
            || item.labels.len() > 8
            || item
                .labels
                .iter()
                .any(|label| label.trim().is_empty() || label.chars().count() > 32)
            || item.labels.iter().collect::<HashSet<_>>().len() != item.labels.len()
            || item
                .due_date
                .as_deref()
                .is_some_and(|date| !valid_date(date))
            || item
                .created_at
                .is_some_and(|timestamp| timestamp > MAX_DATE_TIMESTAMP)
            || item
                .updated_at
                .is_some_and(|timestamp| timestamp > MAX_DATE_TIMESTAMP)
            || item.position.is_some_and(|position| position > MAX_ITEMS)
        {
            return Err("KANBAN_STORAGE_FAILED".into());
        }
    }
    let mut positions = HashSet::with_capacity(items.len());
    for item in items {
        if let Some(position) = item.position {
            if !positions.insert((item.status, position)) {
                return Err("KANBAN_STORAGE_FAILED".into());
            }
        }
    }
    Ok(())
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }
    let year = value[0..4].parse::<u32>().ok();
    let month = value[5..7].parse::<u32>().ok();
    let day = value[8..10].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day)) = (year, month, day) else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day)
}

fn write(app: &AppContext, vault_id: &str, data: &KanbanData) -> Result<(), String> {
    validate(&data.items)?;
    validate_wip_limits(&data.wip_limits)?;
    let bytes = serde_json::to_vec_pretty(data).map_err(|_| "KANBAN_STORAGE_FAILED")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("KANBAN_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&file_path(app, vault_id)?, &bytes, None)
        .map_err(|_| "KANBAN_STORAGE_FAILED".into())
}

pub(crate) async fn read_kanban(app: AppContext, vault_id: String) -> Result<KanbanData, String> {
    crate::runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "KANBAN_STORAGE_FAILED")?;
        read(&app, &vault_id)
    })
    .await
    .map_err(|_| "KANBAN_STORAGE_FAILED".to_string())?
}

pub(crate) async fn save_kanban(
    app: AppContext,
    vault_id: String,
    items: Vec<Item>,
    wip_limits: WipLimits,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
        let _guard = STORAGE.lock().map_err(|_| "KANBAN_STORAGE_FAILED")?;
        write(&app, &vault_id, &KanbanData { items, wip_limits })
    })
    .await
    .map_err(|_| "KANBAN_STORAGE_FAILED".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_items_receive_empty_detail_defaults() {
        let item: Item = serde_json::from_str(
            r#"{"id":"00000000-0000-4000-8000-000000000001","title":"Task","status":"backlog"}"#,
        )
        .unwrap();
        assert!(item.description.is_empty());
        assert!(item.note_id.is_none());
        assert_eq!(item.priority, Priority::None);
        assert!(item.labels.is_empty());
        assert!(item.due_date.is_none());
    }

    #[test]
    fn linked_note_ids_round_trip_and_must_be_canonical_uuids() {
        let item: Item = serde_json::from_str(
            r#"{"id":"00000000-0000-4000-8000-000000000001","title":"Task","noteId":"00000000-0000-4000-8000-000000000002","status":"backlog"}"#,
        )
        .unwrap();
        validate(std::slice::from_ref(&item)).unwrap();
        assert_eq!(
            item.note_id.as_deref(),
            Some("00000000-0000-4000-8000-000000000002")
        );
        assert_eq!(
            serde_json::to_value(item).unwrap()["noteId"],
            "00000000-0000-4000-8000-000000000002"
        );

        let invalid: Item = serde_json::from_str(
            r#"{"id":"00000000-0000-4000-8000-000000000001","title":"Task","noteId":"not-a-note","status":"backlog"}"#,
        )
        .unwrap();
        assert!(validate(&[invalid]).is_err());
    }

    #[test]
    fn due_dates_must_be_real_calendar_dates() {
        assert!(valid_date("2024-02-29"));
        assert!(valid_date("2026-12-31"));
        assert!(!valid_date("2025-02-29"));
        assert!(!valid_date("2026-13-01"));
        assert!(!valid_date("2026-04-31"));
    }

    #[test]
    fn legacy_item_arrays_decode_without_wip_limits() {
        let stored: StoredKanban = serde_json::from_str(
            r#"[{"id":"00000000-0000-4000-8000-000000000001","title":"Task","status":"backlog"}]"#,
        )
        .unwrap();
        let data = match stored {
            StoredKanban::Current(data) => data,
            StoredKanban::Legacy(items) => KanbanData {
                items,
                wip_limits: WipLimits::new(),
            },
        };
        assert_eq!(data.items.len(), 1);
        assert!(data.wip_limits.is_empty());
    }

    #[test]
    fn wip_limits_round_trip_and_reject_out_of_range_values() {
        let limits = HashMap::from([(Status::InProgress, 3)]);
        validate_wip_limits(&limits).unwrap();
        let encoded = serde_json::to_string(&limits).unwrap();
        assert_eq!(encoded, r#"{"inProgress":3}"#);
        assert!(serde_json::from_str::<WipLimits>(&encoded).is_ok());
        assert!(validate_wip_limits(&HashMap::from([(Status::Review, 0)])).is_err());
        assert!(validate_wip_limits(&HashMap::from([(Status::Review, MAX_ITEMS + 1)])).is_err());
    }
}
