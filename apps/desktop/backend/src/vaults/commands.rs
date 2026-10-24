use crate::runtime::AppContext;

use crate::app::{runtime, vault_details};

use super::models::{VaultDeleteResult, VaultDetails, VaultLibrary};

use super::service;

pub(crate) fn list_vaults(app: AppContext) -> Result<VaultLibrary, String> {
    service::list_vaults(&|| runtime::app_directory(&app))
}

pub(crate) async fn get_vault_details(
    app: AppContext,
    vault_id: String,
) -> Result<VaultDetails, String> {
    crate::runtime::spawn_blocking(move || {
        vault_details::get_vault_details(&|| runtime::app_directory(&app), vault_id)
    })
    .await
    .map_err(|_| "VAULT_DETAILS_FAILED".to_string())?
}

pub(crate) async fn create_vault(app: AppContext, name: String) -> Result<VaultLibrary, String> {
    crate::runtime::spawn_blocking(move || {
        service::create_vault(&|| runtime::app_directory(&app), name)
    })
    .await
    .map_err(|_| "VAULT_CREATE_FAILED".to_string())?
}

pub(crate) async fn switch_vault(
    app: AppContext,
    vault_id: String,
) -> Result<VaultLibrary, String> {
    crate::runtime::spawn_blocking(move || {
        service::switch_vault(
            &|| runtime::app_directory(&app),
            &|directory, message| runtime::set_active_vault(&app, directory, message),
            vault_id,
        )
    })
    .await
    .map_err(|_| "VAULT_SWITCH_FAILED".to_string())?
}

pub(crate) async fn rename_vault(
    app: AppContext,
    vault_id: String,
    vault_name: String,
) -> Result<VaultLibrary, String> {
    crate::runtime::spawn_blocking(move || {
        service::rename_vault(&|| runtime::app_directory(&app), vault_id, vault_name)
    })
    .await
    .map_err(|_| "VAULT_RENAME_FAILED".to_string())?
}

pub(crate) async fn delete_vault(
    app: AppContext,
    vault_id: String,
) -> Result<VaultDeleteResult, String> {
    crate::runtime::spawn_blocking(move || {
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

pub(crate) async fn reorder_vaults(
    app: AppContext,
    vault_ids: Vec<String>,
) -> Result<VaultLibrary, String> {
    crate::runtime::spawn_blocking(move || {
        service::reorder_vaults(&|| runtime::app_directory(&app), vault_ids)
    })
    .await
    .map_err(|_| "VAULT_ORDER_FAILED".to_string())?
}
