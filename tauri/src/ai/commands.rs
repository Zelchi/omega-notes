use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use super::{providers::codex::Client, AiState};

fn client(app: &AppHandle) -> Result<Arc<Client>, String> {
    app.state::<AiState>()
        .0
        .lock()
        .map_err(|_| "AI_DISCONNECTED")?
        .as_ref()
        .filter(|client| client.is_alive())
        .cloned()
        .ok_or_else(|| "AI_DISCONNECTED".into())
}

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "AI_REQUEST_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn read_ai_chat(
    app: AppHandle,
    vault_id: String,
    provider_id: super::repository::Provider,
) -> Result<super::repository::Chat, String> {
    blocking(move || super::repository::read(&app, &vault_id, provider_id)).await
}

#[tauri::command]
pub(crate) async fn save_ai_chat(
    app: AppHandle,
    vault_id: String,
    provider_id: super::repository::Provider,
    chat: super::repository::Chat,
) -> Result<(), String> {
    blocking(move || super::repository::save(&app, &vault_id, provider_id, chat)).await
}

#[tauri::command]
pub(crate) async fn clear_ai_chats(app: AppHandle) -> Result<(), String> {
    blocking(move || {
        app.state::<AiState>().shutdown();
        super::repository::clear_all(&app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn ai_connect(app: AppHandle) -> Result<Value, String> {
    blocking(move || {
        let state = app.state::<AiState>();
        let _connection = state.1.lock().map_err(|_| "AI_DISCONNECTED")?;
        let existing = state.0.lock().map_err(|_| "AI_DISCONNECTED")?.clone();
        if let Some(current) = existing.as_ref().filter(|current| current.is_alive()) {
            return current.status();
        }
        if let Some(previous) = state.0.lock().map_err(|_| "AI_DISCONNECTED")?.take() {
            previous.stop();
        }
        let current = Client::start(app.clone())?;
        // Publish the child before waiting for RPC so shutdown can immediately kill it.
        *state.0.lock().map_err(|_| "AI_DISCONNECTED")? = Some(current.clone());
        let status = current.initialize().and_then(|_| current.status());
        if status.is_err() {
            current.stop();
            let mut slot = state.0.lock().map_err(|_| "AI_DISCONNECTED")?;
            if slot
                .as_ref()
                .is_some_and(|client| Arc::ptr_eq(client, &current))
            {
                slot.take();
            }
            return status;
        }
        status
    })
    .await
}

#[tauri::command]
pub(crate) async fn ai_status(app: AppHandle) -> Result<Value, String> {
    blocking(move || client(&app)?.status()).await
}

#[tauri::command]
pub(crate) async fn ai_login(app: AppHandle) -> Result<String, String> {
    blocking(move || {
        let result = client(&app)?.request("account/login/start", json!({"type":"chatgpt"}))?;
        let url = result["authUrl"].as_str().ok_or("AI_PROTOCOL_ERROR")?;
        if !url.starts_with("https://auth.openai.com/") && !url.starts_with("https://chatgpt.com/")
        {
            return Err("AI_PROTOCOL_ERROR".into());
        }
        Ok(url.to_string())
    })
    .await
}

#[tauri::command]
pub(crate) async fn ai_models(app: AppHandle) -> Result<Value, String> {
    blocking(move || {
        let client = client(&app)?;
        let mut models = Vec::new();
        let mut cursor = Value::Null;
        loop {
            let result = client.request("model/list", json!({"limit":100,"cursor":cursor,"includeHidden":false}))?;
            if let Some(data) = result["data"].as_array() {
                models.extend(data.iter().filter(|model| model["hidden"] != true).map(|model| {
                    let efforts: Vec<_> = model["supportedReasoningEfforts"].as_array().into_iter().flatten()
                        .filter_map(|option| option["reasoningEffort"].as_str()).collect();
                    let tiers: Vec<_> = model["serviceTiers"].as_array().into_iter().flatten()
                        .filter_map(|tier| tier["id"].as_str()).collect();
                    json!({"id":model["model"],"name":model["displayName"],"isDefault":model["isDefault"],
                        "defaultEffort":model["defaultReasoningEffort"].as_str().unwrap_or(""),"efforts":efforts,"serviceTiers":tiers})
                }));
            }
            cursor = result["nextCursor"].clone();
            if cursor.is_null() || models.len() >= 500 { break; }
        }
        Ok(json!(models))
    }).await
}

#[tauri::command]
pub(crate) async fn ai_send(
    app: AppHandle,
    vault_id: String,
    request_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    fast: bool,
) -> Result<Value, String> {
    if text.trim().is_empty() || text.len() > 32_000 || uuid::Uuid::parse_str(&request_id).is_err()
    {
        return Err("AI_INVALID_MESSAGE".into());
    }
    blocking(move || {
        let client = client(&app)?;
        let _operation = client.operation.lock().map_err(|_| "AI_DISCONNECTED")?;
        client.send(
            &vault_id,
            &request_id,
            text.trim(),
            model.as_deref(),
            effort.as_deref(),
            fast,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn ai_cancel(
    app: AppHandle,
    vault_id: String,
    clear: bool,
    request_id: Option<String>,
) -> Result<(), String> {
    blocking(move || {
        let Ok(client) = client(&app) else {
            return Ok(());
        };
        let _operation = client.operation.lock().map_err(|_| "AI_DISCONNECTED")?;
        client.cancel(&vault_id, clear, request_id.as_deref())?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn ai_disconnect(app: AppHandle) -> Result<(), String> {
    blocking(move || {
        app.state::<AiState>().shutdown();
        Ok(())
    })
    .await
}
