use crate::pomodoro::PomodoroTimer;
// Explicit protocol allowlist; platform/window commands live in Electron.
use crate::runtime::{AppContext, Channel};
use serde::de::DeserializeOwned;
use serde_json::Value;

fn argument<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|error| format!("Invalid argument {key}: {error}"))
}

pub(crate) async fn dispatch(
    app: AppContext,
    command: String,
    args: Value,
) -> Result<Value, String> {
    match command.as_str() {
        "initialize_pomodoro_timer" => {
            serde_json::to_value(crate::pomodoro::initialize_pomodoro_timer(
                app.clone(),
                app.state::<PomodoroTimer>(),
                argument(&args, "focusMinutes")?,
                argument(&args, "shortBreakMinutes")?,
                argument(&args, "longBreakMinutes")?,
                argument(&args, "cyclesBeforeLongBreak")?,
            )?)
            .map_err(|error| error.to_string())
        }
        "set_pomodoro_settings" => serde_json::to_value(crate::pomodoro::set_pomodoro_settings(
            app.clone(),
            app.state::<PomodoroTimer>(),
            argument(&args, "focusMinutes")?,
            argument(&args, "shortBreakMinutes")?,
            argument(&args, "longBreakMinutes")?,
            argument(&args, "cyclesBeforeLongBreak")?,
        )?)
        .map_err(|error| error.to_string()),
        "read_pomodoro_timer" => serde_json::to_value(crate::pomodoro::read_pomodoro_timer(
            app.clone(),
            app.state::<PomodoroTimer>(),
        )?)
        .map_err(|error| error.to_string()),
        "start_pomodoro_timer" => serde_json::to_value(crate::pomodoro::start_pomodoro_timer(
            app.clone(),
            app.state::<PomodoroTimer>(),
        )?)
        .map_err(|error| error.to_string()),
        "pause_pomodoro_timer" => serde_json::to_value(crate::pomodoro::pause_pomodoro_timer(
            app.clone(),
            app.state::<PomodoroTimer>(),
        )?)
        .map_err(|error| error.to_string()),
        "reset_pomodoro_timer" => serde_json::to_value(crate::pomodoro::reset_pomodoro_timer(
            app.clone(),
            app.state::<PomodoroTimer>(),
        )?)
        .map_err(|error| error.to_string()),
        "next_pomodoro_phase" => serde_json::to_value(crate::pomodoro::next_pomodoro_phase(
            app.clone(),
            app.state::<PomodoroTimer>(),
        )?)
        .map_err(|error| error.to_string()),
        "list_notes" => serde_json::to_value(
            crate::notes::commands::list_notes(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "external")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "stream_note_summaries" => serde_json::to_value(
            crate::notes::commands::stream_note_summaries(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "observerId")?,
                argument(&args, "resetObserverSnapshot")?,
                argument(&args, "external")?,
                Channel::from_argument(&app, &args, "onItem")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "notes_changes" => serde_json::to_value(
            crate::notes::commands::notes_changes(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "observerId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "acknowledge_note_changes" => serde_json::to_value(
            crate::notes::commands::acknowledge_note_changes(
                argument(&args, "observerId")?,
                argument(&args, "changeToken")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "get_note" => serde_json::to_value(
            crate::notes::commands::get_note(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "noteId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "list_note_media" => {
            serde_json::to_value(crate::notes::commands::list_note_media(app.clone()).await?)
                .map_err(|error| error.to_string())
        }
        "list_deleted_note_ids" => {
            serde_json::to_value(crate::notes::commands::list_deleted_note_ids(app.clone()).await?)
                .map_err(|error| error.to_string())
        }
        "create_note" => serde_json::to_value(
            crate::notes::commands::create_note(app.clone(), argument(&args, "noteTitle")?).await?,
        )
        .map_err(|error| error.to_string()),
        "save_note" => serde_json::to_value(
            crate::notes::commands::save_note(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "noteId")?,
                argument(&args, "noteTitle")?,
                argument(&args, "document")?,
                argument(&args, "expectedNote")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "rename_note" => serde_json::to_value(
            crate::notes::commands::rename_note(
                app.clone(),
                argument(&args, "noteId")?,
                argument(&args, "noteTitle")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "delete_note" => serde_json::to_value(
            crate::notes::commands::delete_note(app.clone(), argument(&args, "noteId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "list_deleted_notes" => {
            serde_json::to_value(crate::notes::commands::list_deleted_notes(app.clone()).await?)
                .map_err(|error| error.to_string())
        }
        "restore_deleted_note" => serde_json::to_value(
            crate::notes::commands::restore_deleted_note(app.clone(), argument(&args, "noteId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "list_vaults" => serde_json::to_value(crate::vaults::commands::list_vaults(app.clone())?)
            .map_err(|error| error.to_string()),
        "get_vault_details" => serde_json::to_value(
            crate::vaults::commands::get_vault_details(app.clone(), argument(&args, "vaultId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "create_vault" => serde_json::to_value(
            crate::vaults::commands::create_vault(app.clone(), argument(&args, "name")?).await?,
        )
        .map_err(|error| error.to_string()),
        "switch_vault" => serde_json::to_value(
            crate::vaults::commands::switch_vault(app.clone(), argument(&args, "vaultId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "rename_vault" => serde_json::to_value(
            crate::vaults::commands::rename_vault(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "vaultName")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "delete_vault" => serde_json::to_value(
            crate::vaults::commands::delete_vault(app.clone(), argument(&args, "vaultId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "reorder_vaults" => serde_json::to_value(
            crate::vaults::commands::reorder_vaults(app.clone(), argument(&args, "vaultIds")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "read_kanban" => serde_json::to_value(
            crate::vaults::kanban::read_kanban(app.clone(), argument(&args, "vaultId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "save_kanban" => serde_json::to_value(
            crate::vaults::kanban::save_kanban(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "items")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "read_pomodoro_tasks" => serde_json::to_value(
            crate::vaults::pomodoro_tasks::read_pomodoro_tasks(
                app.clone(),
                argument(&args, "vaultId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "save_pomodoro_tasks" => serde_json::to_value(
            crate::vaults::pomodoro_tasks::save_pomodoro_tasks(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "tasks")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "import_note_image" => serde_json::to_value(
            crate::images::commands::import_note_image(app.clone(), argument(&args, "sourcePath")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "import_note_media" => serde_json::to_value(
            crate::media::commands::import_note_media(
                app.clone(),
                argument(&args, "sourcePath")?,
                argument(&args, "mediaType")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "note_media_stream_url" => serde_json::to_value(
            crate::media::commands::note_media_stream_url(
                app.clone(),
                argument(&args, "mediaId")?,
                argument(&args, "mediaType")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "read_note_image" => serde_json::to_value(
            crate::images::commands::read_note_image(
                app.clone(),
                argument(&args, "imageId")?,
                Channel::from_argument(&app, &args, "onChunk")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "import_clipboard_image" => serde_json::to_value(
            crate::images::commands::import_clipboard_image(app.clone(), argument(&args, "bytes")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "cleanup_orphaned_media" => serde_json::to_value(
            crate::images::commands::cleanup_orphaned_media(app.clone()).await?,
        )
        .map_err(|error| error.to_string()),
        "read_ai_chat" => serde_json::to_value(
            crate::ai::commands::read_ai_chat(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "providerId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "save_ai_chat" => serde_json::to_value(
            crate::ai::commands::save_ai_chat(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "providerId")?,
                argument(&args, "chat")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "clear_ai_chats" => {
            serde_json::to_value(crate::ai::commands::clear_ai_chats(app.clone()).await?)
                .map_err(|error| error.to_string())
        }
        "ai_connect" => serde_json::to_value(crate::ai::commands::ai_connect(app.clone()).await?)
            .map_err(|error| error.to_string()),
        "ai_status" => serde_json::to_value(crate::ai::commands::ai_status(app.clone()).await?)
            .map_err(|error| error.to_string()),
        "ai_login" => serde_json::to_value(crate::ai::commands::ai_login(app.clone()).await?)
            .map_err(|error| error.to_string()),
        "ai_models" => serde_json::to_value(crate::ai::commands::ai_models(app.clone()).await?)
            .map_err(|error| error.to_string()),
        "ai_send" => serde_json::to_value(
            crate::ai::commands::ai_send(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
                argument(&args, "text")?,
                argument(&args, "model")?,
                argument(&args, "effort")?,
                argument(&args, "fast")?,
                argument(&args, "purpose")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_steer" => serde_json::to_value(
            crate::ai::commands::ai_steer(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
                argument(&args, "text")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cancel" => serde_json::to_value(
            crate::ai::commands::ai_cancel(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "clear")?,
                argument(&args, "requestId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_disconnect" => {
            serde_json::to_value(crate::ai::commands::ai_disconnect(app.clone()).await?)
                .map_err(|error| error.to_string())
        }
        "ai_installed_providers" => {
            serde_json::to_value(crate::ai::cli_commands::ai_installed_providers().await?)
                .map_err(|error| error.to_string())
        }
        "ai_cli_connect" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_connect(app.clone(), argument(&args, "providerId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_status" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_status(app.clone(), argument(&args, "providerId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_models" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_models(app.clone(), argument(&args, "providerId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_login" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_login(app.clone(), argument(&args, "providerId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_send" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_send(
                app.clone(),
                argument(&args, "providerId")?,
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
                argument(&args, "text")?,
                argument(&args, "model")?,
                argument(&args, "effort")?,
                argument(&args, "purpose")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_cancel" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_cancel(
                app.clone(),
                argument(&args, "providerId")?,
                argument(&args, "vaultId")?,
                argument(&args, "clear")?,
                argument(&args, "requestId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "ai_cli_disconnect" => serde_json::to_value(
            crate::ai::cli_commands::ai_cli_disconnect(app.clone(), argument(&args, "providerId")?)
                .await?,
        )
        .map_err(|error| error.to_string()),
        "complete_ai_link_request" => {
            serde_json::to_value(crate::ai::link_requests::complete_ai_link_request(
                app.clone(),
                argument(&args, "ticket")?,
                argument(&args, "error")?,
            )?)
            .map_err(|error| error.to_string())
        }
        "read_studies" => serde_json::to_value(
            crate::ai::studies::read_studies(
                app.clone(),
                argument(&args, "vaultId")?,
                Channel::from_argument(&app, &args, "onItem")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "read_study" => serde_json::to_value(
            crate::ai::studies::read_study(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "studyId")?,
                argument(&args, "kind")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "save_study" => serde_json::to_value(
            crate::ai::studies::save_study(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "study")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "delete_study" => serde_json::to_value(
            crate::ai::studies::delete_study(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "studyId")?,
                argument(&args, "kind")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "save_study_progress" => serde_json::to_value(
            crate::ai::studies::save_study_progress(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "studyId")?,
                argument(&args, "kind")?,
                argument(&args, "progress")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "prepare_study_context" => serde_json::to_value(
            crate::ai::study_context::prepare_study_context(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
                argument(&args, "items")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "validate_study_context" => serde_json::to_value(
            crate::ai::study_context::validate_study_context(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "release_study_context" => serde_json::to_value(
            crate::ai::study_context::release_study_context(argument(&args, "requestId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "fetch_url_title" => {
            serde_json::to_value(crate::web::fetch_url_title(argument(&args, "url")?).await?)
                .map_err(|error| error.to_string())
        }
        "terminal_sync_instructions" => serde_json::to_value(
            crate::terminal::terminal_sync_instructions(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "enabled")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_open" => serde_json::to_value(
            crate::terminal::terminal_open(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "sessionId")?,
                argument(&args, "providerId")?,
                argument(&args, "cols")?,
                argument(&args, "rows")?,
                Channel::from_argument(&app, &args, "output")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_write" => serde_json::to_value(
            crate::terminal::terminal_write(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "sessionId")?,
                argument(&args, "data")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_resize" => serde_json::to_value(
            crate::terminal::terminal_resize(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "sessionId")?,
                argument(&args, "cols")?,
                argument(&args, "rows")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_ack" => serde_json::to_value(crate::terminal::terminal_ack(
            app.clone(),
            argument(&args, "vaultId")?,
            argument(&args, "sessionId")?,
            argument(&args, "sequence")?,
        )?)
        .map_err(|error| error.to_string()),
        "terminal_close" => serde_json::to_value(
            crate::terminal::terminal_close(app.clone(), argument(&args, "sessionId")?).await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_create_study_request" => serde_json::to_value(
            crate::terminal::studies::terminal_create_study_request(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
                argument(&args, "prompt")?,
                argument(&args, "purpose")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_read_study_response" => serde_json::to_value(
            crate::terminal::studies::terminal_read_study_response(
                app.clone(),
                argument(&args, "vaultId")?,
                argument(&args, "requestId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "terminal_close_study_request" => serde_json::to_value(
            crate::terminal::studies::terminal_close_study_request(
                app.clone(),
                argument(&args, "requestId")?,
            )
            .await?,
        )
        .map_err(|error| error.to_string()),
        "updater_ready" => Ok(serde_json::json!(crate::updates::ready())),
        "updater_check" => crate::updates::check(app).await,
        "updater_download" => {
            serde_json::to_value(crate::updates::download(app, argument(&args, "version")?).await?)
                .map_err(|error| error.to_string())
        }
        "updater_install" => crate::updates::install(app, argument(&args, "version")?).await,
        _ => Err("Unknown backend command".into()),
    }
}
