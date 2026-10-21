mod ai;
mod app;
mod graphics_compat;
mod images;
mod media;
mod names;
mod notes;
mod storage;
mod stream;
mod terminal;
mod vaults;
mod web;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if ai::run_if_requested() || terminal::run_if_requested() {
        return;
    }
    graphics_compat::configure_nvidia_wayland();
    let builder = tauri::Builder::default();
    #[cfg(target_os = "linux")]
    let builder = builder.plugin(tauri_plugin_wayland_nvidia_quirk::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app::runtime::ActiveVault(Mutex::new(None)))
        .manage(ai::AiState::default())
        .manage(terminal::TerminalState::default())
        .manage(ai::link_requests::LinkRequests::default())
        .setup(|app| {
            app::setup::initialize(app.handle().clone())?;
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
            notes::commands::list_notes,
            notes::commands::stream_note_summaries,
            notes::commands::notes_changes,
            notes::commands::acknowledge_note_changes,
            notes::commands::get_note,
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
            media::commands::import_note_media,
            media::commands::cleanup_orphaned_media,
            stream::commands::note_media_stream_url
        ])
        .build(tauri::generate_context!())
        .expect("erro ao executar Ômega Notes")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                app.state::<ai::AiState>().shutdown();
                app.state::<terminal::TerminalState>().shutdown();
            }
        });
}
