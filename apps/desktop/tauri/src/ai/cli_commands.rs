use super::{providers::cli::Client, repository::Provider, AiState};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}
fn client(app: &AppHandle, provider: Provider) -> Result<Arc<Client>, String> {
    app.state::<AiState>()
        .2
        .lock()
        .map_err(|_| "AI_DISCONNECTED")?
        .get(&provider)
        .filter(|client| client.is_alive())
        .cloned()
        .ok_or_else(|| "AI_DISCONNECTED".into())
}
#[tauri::command]
pub(crate) async fn ai_installed_providers() -> Result<Value, String> {
    blocking(|| Ok(super::providers::installed())).await
}
#[tauri::command]
pub(crate) async fn ai_cli_connect(app: AppHandle, provider_id: Provider) -> Result<Value, String> {
    blocking(move || {
        let state = app.state::<AiState>();
        let _connection = state.1.lock().map_err(|_| "AI_DISCONNECTED")?;
        if let Ok(current) = client(&app, provider_id) {
            return current.status();
        }
        let current = Client::start(app.clone(), provider_id)?;
        let status = current.status()?;
        state
            .2
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .insert(provider_id, current);
        Ok(status)
    })
    .await
}
#[tauri::command]
pub(crate) async fn ai_cli_status(app: AppHandle, provider_id: Provider) -> Result<Value, String> {
    blocking(move || client(&app, provider_id)?.status()).await
}
#[tauri::command]
pub(crate) async fn ai_cli_models(app: AppHandle, provider_id: Provider) -> Result<Value, String> {
    blocking(move || client(&app, provider_id)?.models()).await
}
#[tauri::command]
pub(crate) async fn ai_cli_login(app: AppHandle, provider_id: Provider) -> Result<(), String> {
    blocking(move || client(&app, provider_id)?.login()).await
}
#[tauri::command]
pub(crate) async fn ai_cli_send(
    app: AppHandle,
    provider_id: Provider,
    vault_id: String,
    request_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    purpose: Option<super::task::Purpose>,
) -> Result<Value, String> {
    if text.trim().is_empty() || text.len() > 32_000 || uuid::Uuid::parse_str(&request_id).is_err()
    {
        return Err("AI_INVALID_MESSAGE".into());
    }
    if model
        .as_ref()
        .is_some_and(|model| model.len() > 300 || model.chars().any(char::is_control))
    {
        return Err("AI_INVALID_MESSAGE".into());
    }
    blocking(move || {
        let client = client(&app, provider_id)?;
        let _operation = client.operation.lock().map_err(|_| "AI_DISCONNECTED")?;
        client.send(
            &vault_id,
            &request_id,
            text.trim(),
            model.as_deref(),
            effort.as_deref(),
            purpose.unwrap_or_default(),
        )
    })
    .await
}
#[tauri::command]
pub(crate) async fn ai_cli_cancel(
    app: AppHandle,
    provider_id: Provider,
    vault_id: String,
    request_id: Option<String>,
) -> Result<(), String> {
    blocking(move || {
        if let Ok(client) = client(&app, provider_id) {
            let _operation = client.operation.lock().map_err(|_| "AI_DISCONNECTED")?;
            client.cancel(&vault_id, request_id.as_deref())?;
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub(crate) async fn ai_cli_disconnect(app: AppHandle, provider_id: Provider) -> Result<(), String> {
    blocking(move || {
        let state = app.state::<AiState>();
        let _connection = state.1.lock().map_err(|_| "AI_DISCONNECTED")?;
        let client = state
            .2
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .remove(&provider_id);
        if let Some(client) = client {
            client.stop();
        }
        Ok(())
    })
    .await
}
