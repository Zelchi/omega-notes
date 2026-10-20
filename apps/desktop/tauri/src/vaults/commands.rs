use tauri::{AppHandle, Manager};

use crate::app::{runtime, vault_details};

use super::models::{VaultDeleteResult, VaultDetails, VaultLibrary};

use super::service;

#[tauri::command]
pub(crate) fn list_vaults(app: AppHandle) -> Result<VaultLibrary, String> {
    service::list_vaults(&|| runtime::app_directory(&app))
}

#[tauri::command]
pub(crate) fn get_vault_details(app: AppHandle, vault_id: String) -> Result<VaultDetails, String> {
    vault_details::get_vault_details(&|| runtime::app_directory(&app), vault_id)
}

#[tauri::command]
pub(crate) fn create_vault(app: AppHandle, name: String) -> Result<VaultLibrary, String> {
    service::create_vault(&|| runtime::app_directory(&app), name)
}

#[tauri::command]
pub(crate) fn switch_vault(app: AppHandle, vault_id: String) -> Result<VaultLibrary, String> {
    service::switch_vault(
        &|| runtime::app_directory(&app),
        &|directory, message| runtime::set_active_vault(&app, directory, message),
        vault_id,
    )
}

#[tauri::command]
pub(crate) fn rename_vault(
    app: AppHandle,
    vault_id: String,
    vault_name: String,
) -> Result<VaultLibrary, String> {
    service::rename_vault(&|| runtime::app_directory(&app), vault_id, vault_name)
}

#[tauri::command]
pub(crate) async fn delete_vault(
    app: AppHandle,
    vault_id: String,
) -> Result<VaultDeleteResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::terminal::TerminalState>()
            .close_vault(&vault_id)?;
        service::delete_vault(
            &|| runtime::app_directory(&app),
            &|directory, message| runtime::set_active_vault(&app, directory, message),
            vault_id,
        )
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}

#[tauri::command]
pub(crate) fn reorder_vaults(
    app: AppHandle,
    vault_ids: Vec<String>,
) -> Result<VaultLibrary, String> {
    service::reorder_vaults(&|| runtime::app_directory(&app), vault_ids)
}
