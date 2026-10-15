mod ai;
mod app;
mod exports;
mod images;
mod media;
mod names;
mod notes;
mod storage;
mod stream;
mod vaults;
mod web;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if ai::run_if_requested() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app::runtime::ActiveVault(Mutex::new(None)))
        .manage(ai::AiState::default())
        .manage(ai::link_requests::LinkRequests::default())
        .setup(|app| {
            app::setup::initialize(app.handle().clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            exports::commands::export_note_pdf,
            vaults::commands::list_vaults,
            vaults::commands::get_vault_details,
            vaults::commands::create_vault,
            vaults::commands::switch_vault,
            vaults::commands::rename_vault,
            vaults::commands::delete_vault,
            notes::commands::list_notes,
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
            stream::commands::note_media_stream_url
        ])
        .build(tauri::generate_context!())
        .expect("erro ao executar Ômega Notes")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                app.state::<ai::AiState>().shutdown();
            }
        });
}
