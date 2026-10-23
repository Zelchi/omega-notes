pub(crate) mod commands;
pub(crate) mod kanban;
mod media_migration;
mod models;
pub(crate) mod pomodoro_tasks;
mod repository;
mod service;

pub(crate) use models::VaultDetails;
pub(crate) use repository::{
    ensure_app_directory, existing_vault_notes_dir, read_vault_registry, vault_backups_directory,
    vault_directory, vault_storage_stats,
};
pub(crate) use service::initialize_active_vault;
