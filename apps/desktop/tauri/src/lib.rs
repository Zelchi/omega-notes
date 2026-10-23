mod ai;
mod app;
#[cfg(target_os = "linux")]
mod cef_wayland_osr;
mod images;
mod names;
mod notes;
mod pomodoro;
mod storage;
mod terminal;
mod tray;
mod vaults;
mod web;
mod window_background;
mod window_drag;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("Ômega Notes oferece suporte apenas a Linux e Windows.");

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if ai::run_if_requested() || terminal::run_if_requested() {
        return;
    }
    let builder = tauri::Builder::default();
    #[cfg(target_os = "linux")]
    let cef_runtime = if wayland_osr_enabled() {
        let cache_base = std::env::var_os("XDG_CACHE_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".cache"))
            })
            .unwrap_or_else(std::env::temp_dir);
        tauri_runtime_cef::Cef::default()
            .root_cache_path(cache_base.join("com.omegastudy.app/cef-wayland-osr"))
            .with_settings(|settings| {
                settings.windowless_rendering_enabled = 1;
            })
    } else {
        tauri_runtime_cef::Cef::default()
    };
    #[cfg(target_os = "linux")]
    let builder = builder.runtime(cef_runtime);
    #[cfg(target_os = "windows")]
    let builder = builder.runtime(tauri_runtime_wry::Wry::default());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app::runtime::ActiveVault(Mutex::new(None)))
        .manage(ai::AiState::default())
        .manage(terminal::TerminalState::default())
        .manage(pomodoro::PomodoroTimer::default())
        .manage(tray::TrayState::default())
        .manage(ai::link_requests::LinkRequests::default())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if wayland_osr_enabled() {
                let window_config = app
                    .config()
                    .app
                    .windows
                    .first()
                    .ok_or("main window configuration is missing")?;
                let mut window_builder =
                    tauri::WebviewWindowBuilder::from_config(app, window_config)?;
                use tauri_runtime_cef::AsCefWebviewAttributes;
                if let Some(attributes) = window_builder
                    .runtime_specific_attributes_mut()
                    .as_cef_webview_attributes_mut()
                {
                    attributes.offscreen = Some(cef_wayland_osr::offscreen());
                }
                window_builder.build()?;
            }

            app::setup::initialize(app.handle().clone())?;
            tray::initialize(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            terminal::terminal_open,
            terminal::terminal_sync_instructions,
            terminal::studies::terminal_create_study_request,
            terminal::studies::terminal_read_study_response,
            terminal::studies::terminal_close_study_request,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_ack,
            terminal::terminal_close,
            ai::commands::ai_connect,
            ai::commands::ai_status,
            ai::commands::ai_login,
            ai::commands::ai_models,
            ai::commands::ai_send,
            ai::commands::ai_steer,
            ai::commands::ai_cancel,
            ai::commands::ai_disconnect,
            ai::cli_commands::ai_cli_connect,
            ai::cli_commands::ai_installed_providers,
            ai::cli_commands::ai_cli_status,
            ai::cli_commands::ai_cli_models,
            ai::cli_commands::ai_cli_login,
            ai::cli_commands::ai_cli_send,
            ai::cli_commands::ai_cli_cancel,
            ai::cli_commands::ai_cli_disconnect,
            ai::commands::read_ai_chat,
            ai::commands::save_ai_chat,
            ai::commands::clear_ai_chats,
            ai::link_requests::complete_ai_link_request,
            app::updates::updater_ready,
            web::fetch_url_title,
            ai::studies::read_studies,
            ai::studies::read_study,
            ai::studies::save_study,
            ai::studies::save_study_progress,
            ai::studies::delete_study,
            ai::study_context::prepare_study_context,
            ai::study_context::release_study_context,
            ai::study_context::validate_study_context,
            vaults::commands::list_vaults,
            vaults::commands::get_vault_details,
            vaults::commands::create_vault,
            vaults::commands::switch_vault,
            vaults::commands::rename_vault,
            vaults::commands::reorder_vaults,
            vaults::commands::delete_vault,
            vaults::kanban::read_kanban,
            vaults::kanban::save_kanban,
            vaults::pomodoro_tasks::read_pomodoro_tasks,
            vaults::pomodoro_tasks::save_pomodoro_tasks,
            pomodoro::initialize_pomodoro_timer,
            pomodoro::set_pomodoro_settings,
            pomodoro::read_pomodoro_timer,
            pomodoro::start_pomodoro_timer,
            pomodoro::pause_pomodoro_timer,
            pomodoro::reset_pomodoro_timer,
            pomodoro::next_pomodoro_phase,
            tray::hide_main_window,
            tray::show_main_window,
            tray::exit_main_app,
            tray::configure_tray_menu,
            app::setup::is_gnome_desktop,
            window_background::set_window_background_color,
            window_drag::start_window_drag,
            window_drag::start_window_resize,
            notes::commands::list_notes,
            notes::commands::stream_note_summaries,
            notes::commands::notes_changes,
            notes::commands::acknowledge_note_changes,
            notes::commands::get_note,
            notes::commands::list_note_media,
            notes::commands::list_deleted_note_ids,
            notes::commands::create_note,
            notes::commands::save_note,
            notes::commands::rename_note,
            notes::commands::delete_note,
            notes::commands::list_deleted_notes,
            notes::commands::restore_deleted_note,
            images::commands::import_note_image,
            images::commands::import_clipboard_image,
            images::commands::read_note_image,
            images::commands::cleanup_orphaned_media
        ])
        .build({
            let mut context = tauri::generate_context!();
            #[cfg(target_os = "linux")]
            if wayland_osr_enabled() {
                if let Some(window) = context.config_mut().app.windows.first_mut() {
                    window.create = false;
                }
            }
            context
        })
        .expect("erro ao executar Ômega Notes")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                app.state::<ai::AiState>().shutdown();
                app.state::<terminal::TerminalState>().shutdown();
            }
        });
}

#[cfg(target_os = "linux")]
fn wayland_osr_enabled() -> bool {
    std::env::var("OMEGA_CEF_WAYLAND_OSR").is_ok_and(|value| value == "1")
}
