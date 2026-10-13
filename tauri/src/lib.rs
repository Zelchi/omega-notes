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

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app::runtime::ActiveVault(Mutex::new(None)))
        .manage(ai::AiState::default())
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
            ai::commands::ai_cancel,
            ai::commands::ai_disconnect,
            ai::commands::read_ai_chat,
            ai::commands::save_ai_chat,
            ai::commands::clear_ai_chats,
            app::updates::updater_ready,
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
            images::commands::import_note_image,
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
