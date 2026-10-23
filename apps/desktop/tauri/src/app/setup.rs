use tauri::AppHandle;

use crate::vaults;

use super::runtime;

#[tauri::command]
pub(crate) fn is_gnome_desktop() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .split(':')
            .any(|desktop| {
                let desktop = desktop.to_ascii_lowercase();
                desktop == "gnome" || desktop.starts_with("gnome-")
            })
    }

    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[derive(Debug)]
pub(crate) struct SetupFailure(String);

impl std::fmt::Display for SetupFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for SetupFailure {}

pub(crate) fn initialize(app: AppHandle) -> Result<(), SetupFailure> {
    vaults::initialize_active_vault(&|| runtime::app_directory(&app), &|directory, message| {
        runtime::set_active_vault(&app, directory, message)
    })
    .map_err(SetupFailure)?;

    Ok(())
}
