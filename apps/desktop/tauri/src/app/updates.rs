#[tauri::command]
pub(crate) fn updater_ready(app: tauri::AppHandle) -> bool {
    #[cfg(target_os = "linux")]
    if !matches!(
        tauri::utils::platform::bundle_type(),
        Some(tauri::utils::config::BundleType::Deb | tauri::utils::config::BundleType::Rpm)
    ) {
        return false;
    }

    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("endpoints"))
        .and_then(serde_json::Value::as_array)
        .is_some_and(|endpoints| !endpoints.is_empty())
}
