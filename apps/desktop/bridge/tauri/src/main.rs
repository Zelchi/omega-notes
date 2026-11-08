#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use omega_notes_lib::DesktopBackend;
use serde_json::{json, Value};
use std::{io, io::Write, path::Path, sync::Mutex};
use tauri::{
    http::{Request, Response, StatusCode, Uri},
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};

struct BackendEventWriter {
    app: AppHandle,
    buffer: Vec<u8>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayLabels {
    show: String,
    hide: String,
    start: String,
    pause: String,
    reset: String,
    music_play: String,
    music_pause: String,
    music_next: String,
    update: String,
    exit: String,
}

struct TrayMenuState {
    labels: Mutex<TrayLabels>,
    pomodoro_running: Mutex<bool>,
    music_playing: Mutex<bool>,
    visibility: MenuItem<tauri::Wry>,
    pomodoro: MenuItem<tauri::Wry>,
    reset: MenuItem<tauri::Wry>,
    music_play_pause: MenuItem<tauri::Wry>,
    music_next: MenuItem<tauri::Wry>,
    update: MenuItem<tauri::Wry>,
    exit: MenuItem<tauri::Wry>,
}

struct DynamicTrayLabels {
    visibility: String,
    pomodoro: String,
    music_play_pause: String,
}

fn dynamic_tray_labels(
    labels: &TrayLabels,
    visible: bool,
    pomodoro_running: bool,
    music_playing: bool,
) -> DynamicTrayLabels {
    DynamicTrayLabels {
        visibility: if visible {
            labels.hide.clone()
        } else {
            labels.show.clone()
        },
        pomodoro: if pomodoro_running {
            labels.pause.clone()
        } else {
            labels.start.clone()
        },
        music_play_pause: if music_playing {
            labels.music_pause.clone()
        } else {
            labels.music_play.clone()
        },
    }
}

impl TrayMenuState {
    fn refresh(&self, app: &AppHandle) -> Result<(), String> {
        let labels = self
            .labels
            .lock()
            .map_err(|_| "Tray menu unavailable")?
            .clone();
        let running = *self
            .pomodoro_running
            .lock()
            .map_err(|_| "Tray menu unavailable")?;
        let music_playing = *self
            .music_playing
            .lock()
            .map_err(|_| "Tray menu unavailable")?;
        let visible = app
            .get_webview_window("main")
            .map(|window| window.is_visible().map_err(|error| error.to_string()))
            .transpose()?
            .unwrap_or(false);
        let dynamic = dynamic_tray_labels(&labels, visible, running, music_playing);
        self.visibility
            .set_text(dynamic.visibility)
            .map_err(|error| error.to_string())?;
        self.pomodoro
            .set_text(dynamic.pomodoro)
            .map_err(|error| error.to_string())?;
        self.reset
            .set_text(labels.reset)
            .map_err(|error| error.to_string())?;
        self.music_play_pause
            .set_text(dynamic.music_play_pause)
            .map_err(|error| error.to_string())?;
        self.music_next
            .set_text(labels.music_next)
            .map_err(|error| error.to_string())?;
        self.update
            .set_text(labels.update)
            .map_err(|error| error.to_string())?;
        self.exit
            .set_text(labels.exit)
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

impl Write for BackendEventWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.buffer.extend_from_slice(bytes);
        while let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<_> = self.buffer.drain(..=end).collect();
            let message: Value =
                serde_json::from_slice(&line[..line.len() - 1]).map_err(io::Error::other)?;
            let event = if let Some(name) = message.get("event") {
                Some((
                    "omega:event",
                    json!({"event":name,"payload":message.get("payload")}),
                ))
            } else if let Some(id) = message.get("channel") {
                Some((
                    "omega:channel",
                    json!({"id":id,"payload":message.get("payload")}),
                ))
            } else {
                None
            };
            if let Some((name, payload)) = event {
                self.app.emit(name, payload).map_err(io::Error::other)?;
            }
        }
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[tauri::command]
async fn desktop_dispatch(
    backend: State<'_, DesktopBackend>,
    command: String,
    args: Value,
) -> Result<Value, String> {
    backend.invoke(command, args).await
}

#[tauri::command]
fn configure_tray_menu(
    app: AppHandle,
    tray: State<'_, TrayMenuState>,
    labels: TrayLabels,
    pomodoro_running: bool,
    music_playing: bool,
) -> Result<(), String> {
    if [
        &labels.show,
        &labels.hide,
        &labels.start,
        &labels.pause,
        &labels.reset,
        &labels.music_play,
        &labels.music_pause,
        &labels.music_next,
        &labels.update,
        &labels.exit,
    ]
    .iter()
    .any(|label| label.trim().is_empty() || label.len() > 160)
    {
        return Err("Invalid tray configuration".into());
    }
    *tray.labels.lock().map_err(|_| "Tray menu unavailable")? = labels;
    *tray
        .pomodoro_running
        .lock()
        .map_err(|_| "Tray menu unavailable")? = pomodoro_running;
    *tray
        .music_playing
        .lock()
        .map_err(|_| "Tray menu unavailable")? = music_playing;
    tray.refresh(&app)
}

fn refresh_tray_menu(app: &AppHandle) -> Result<(), String> {
    if let Some(tray) = app.try_state::<TrayMenuState>() {
        tray.refresh(app)?;
    }
    Ok(())
}

fn set_window_visibility(app: &AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window unavailable".to_string())?;
    let operation = if visible {
        window
            .show()
            .map_err(|error| error.to_string())
            .and_then(|()| window.set_focus().map_err(|error| error.to_string()))
    } else {
        window.hide().map_err(|error| error.to_string())
    };
    let refresh = refresh_tray_menu(app);
    operation?;
    refresh
}

fn toggle_window_visibility(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window unavailable".to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    set_window_visibility(app, !visible)
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    set_window_visibility(&app, false)
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    set_window_visibility(&app, true)
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn relaunch_app(app: AppHandle) {
    app.restart();
}

fn emit_tray_action(app: &AppHandle, action: &str) {
    let _ = app.emit(
        "omega:event",
        json!({"event":"omega-tray-action","payload":action}),
    );
}

fn show_window(app: &AppHandle) {
    if let Err(error) = set_window_visibility(app, true) {
        eprintln!("Could not show main window: {error}");
    }
}

fn image_response(
    status: StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .expect("valid image response")
}

fn is_canonical_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}

fn parse_image_uri(uri: &Uri) -> Result<(String, String), StatusCode> {
    let authority = uri.authority().ok_or(StatusCode::NOT_FOUND)?;
    if uri.scheme_str() != Some("http")
        || authority.as_str() != "omega-image.localhost"
        || uri.query().is_some()
    {
        return Err(StatusCode::NOT_FOUND);
    }
    let path = uri.path().strip_prefix('/').ok_or(StatusCode::NOT_FOUND)?;
    let (vault_id, image_id) = path.split_once('/').ok_or(StatusCode::NOT_FOUND)?;
    if image_id.contains('/') || !is_canonical_uuid(vault_id) || !is_canonical_uuid(image_id) {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok((vault_id.to_owned(), image_id.to_owned()))
}

fn image_content_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

fn main() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "omega-image",
            |_ctx, request: Request<Vec<u8>>, responder| {
                let app = _ctx.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if request.method() != "GET" {
                        responder.respond(image_response(
                            StatusCode::METHOD_NOT_ALLOWED,
                            "text/plain",
                            Vec::new(),
                        ));
                        return;
                    }
                    let (vault_id, image_id) = match parse_image_uri(request.uri()) {
                        Ok(ids) => ids,
                        Err(status) => {
                            responder.respond(image_response(status, "text/plain", Vec::new()));
                            return;
                        }
                    };
                    let resolved = app
                        .state::<DesktopBackend>()
                        .resolve_note_image_path(vault_id, image_id)
                        .await;
                    let path = match resolved {
                        Ok(path) => path,
                        Err(error) => {
                            let status = if error == "NOTE_IMAGE_VAULT_CHANGED" {
                                StatusCode::FORBIDDEN
                            } else {
                                StatusCode::NOT_FOUND
                            };
                            responder.respond(image_response(status, "text/plain", Vec::new()));
                            return;
                        }
                    };
                    let content_type = match image_content_type(Path::new(&path)) {
                        Some(content_type) => content_type,
                        None => {
                            responder.respond(image_response(
                                StatusCode::NOT_FOUND,
                                "text/plain",
                                Vec::new(),
                            ));
                            return;
                        }
                    };
                    match tauri::async_runtime::spawn_blocking(move || std::fs::read(path)).await {
                        Ok(Ok(bytes)) => {
                            responder.respond(image_response(StatusCode::OK, content_type, bytes))
                        }
                        _ => responder.respond(image_response(
                            StatusCode::NOT_FOUND,
                            "text/plain",
                            Vec::new(),
                        )),
                    }
                });
            },
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let documents = app.path().document_dir()?;
            let cache = app.path().app_cache_dir()?;
            let backend = DesktopBackend::new(
                documents,
                cache,
                Box::new(BackendEventWriter {
                    app: app.handle().clone(),
                    buffer: Vec::new(),
                }),
            )
            .map_err(io::Error::other)?;
            app.manage(backend);

            let visibility = MenuItem::with_id(app, "visibility", "Show", true, None::<&str>)?;
            let pomodoro = MenuItem::with_id(app, "pomodoro", "Start", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "Reset", true, None::<&str>)?;
            let music_play_pause =
                MenuItem::with_id(app, "music-play-pause", "Play music", true, None::<&str>)?;
            let music_next =
                MenuItem::with_id(app, "music-next", "Next station", true, None::<&str>)?;
            let update = MenuItem::with_id(app, "update", "Update", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            let first_separator = PredefinedMenuItem::separator(app)?;
            let second_separator = PredefinedMenuItem::separator(app)?;
            let third_separator = PredefinedMenuItem::separator(app)?;
            let fourth_separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &visibility,
                    &first_separator,
                    &pomodoro,
                    &reset,
                    &second_separator,
                    &music_play_pause,
                    &music_next,
                    &third_separator,
                    &update,
                    &fourth_separator,
                    &exit,
                ],
            )?;
            let tray_state = TrayMenuState {
                labels: Mutex::new(TrayLabels {
                    show: "Show".into(),
                    hide: "Hide".into(),
                    start: "Start timer".into(),
                    pause: "Pause timer".into(),
                    reset: "Reset timer".into(),
                    music_play: "Play music".into(),
                    music_pause: "Pause music".into(),
                    music_next: "Next station".into(),
                    update: "Update".into(),
                    exit: "Exit".into(),
                }),
                pomodoro_running: Mutex::new(false),
                music_playing: Mutex::new(false),
                visibility: visibility.clone(),
                pomodoro: pomodoro.clone(),
                reset: reset.clone(),
                music_play_pause: music_play_pause.clone(),
                music_next: music_next.clone(),
                update: update.clone(),
                exit: exit.clone(),
            };
            app.manage(tray_state);
            let icon = app
                .default_window_icon()
                .ok_or_else(|| io::Error::other("Tauri window icon is missing"))?
                .clone();
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Ômega Notes")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "visibility" => {
                        if let Err(error) = toggle_window_visibility(app) {
                            eprintln!("Could not toggle main window visibility: {error}");
                        }
                    }
                    "pomodoro" => {
                        if let Some(tray) = app.try_state::<TrayMenuState>() {
                            if let Ok(mut running) = tray.pomodoro_running.lock() {
                                *running = !*running;
                            }
                            let _ = tray.refresh(app);
                        }
                        emit_tray_action(app, "pomodoro-toggle");
                    }
                    "reset" => emit_tray_action(app, "pomodoro-reset"),
                    "music-play-pause" => emit_tray_action(app, "music-play-pause"),
                    "music-next" => emit_tray_action(app, "music-next"),
                    "update" => {
                        show_window(app);
                        emit_tray_action(app, "update");
                    }
                    "exit" => {
                        let app = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(150));
                            emit_tray_action(&app, "exit");
                        });
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.emit(
                    "omega:event",
                    json!({"event":"window-close-requested","payload":null}),
                );
            }
            tauri::WindowEvent::Resized(_)
            | tauri::WindowEvent::Moved(_)
            | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                let _ = window.emit(
                    "omega:event",
                    json!({"event":"window-resized","payload":null}),
                );
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            desktop_dispatch,
            hide_main_window,
            show_main_window,
            exit_app,
            relaunch_app,
            configure_tray_menu
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o host Tauri");
}

#[cfg(test)]
mod tests {
    use super::{dynamic_tray_labels, parse_image_uri, TrayLabels};
    use tauri::http::{StatusCode, Uri};
    use uuid::Uuid;

    fn labels() -> TrayLabels {
        TrayLabels {
            show: "Show".into(),
            hide: "Hide".into(),
            start: "Start".into(),
            pause: "Pause".into(),
            reset: "Reset".into(),
            music_play: "Play music".into(),
            music_pause: "Pause music".into(),
            music_next: "Next station".into(),
            update: "Update".into(),
            exit: "Exit".into(),
        }
    }

    #[test]
    fn windows_image_uri_uses_the_registered_localhost_protocol() {
        let vault_id = Uuid::now_v7().to_string();
        let image_id = Uuid::now_v7().to_string();
        let uri: Uri = format!("http://omega-image.localhost/{vault_id}/{image_id}")
            .parse()
            .unwrap();
        assert_eq!(
            parse_image_uri(&uri).unwrap(),
            (vault_id.clone(), image_id.clone())
        );

        let traversal: Uri = format!("http://omega-image.localhost/{vault_id}/../outside")
            .parse()
            .unwrap();
        assert_eq!(parse_image_uri(&traversal), Err(StatusCode::NOT_FOUND));

        let wrong_origin: Uri = format!("http://{vault_id}/{image_id}").parse().unwrap();
        assert_eq!(parse_image_uri(&wrong_origin), Err(StatusCode::NOT_FOUND));

        let wrong_scheme: Uri =
            format!("omega-image://omega-image.localhost/{vault_id}/{image_id}")
                .parse()
                .unwrap();
        assert_eq!(parse_image_uri(&wrong_scheme), Err(StatusCode::NOT_FOUND));
    }

    #[test]
    fn tray_labels_reflect_current_window_and_playback_state() {
        let labels = labels();
        let hidden = dynamic_tray_labels(&labels, false, false, false);
        assert_eq!(hidden.visibility, "Show");
        assert_eq!(hidden.pomodoro, "Start");
        assert_eq!(hidden.music_play_pause, "Play music");

        let active = dynamic_tray_labels(&labels, true, true, true);
        assert_eq!(active.visibility, "Hide");
        assert_eq!(active.pomodoro, "Pause");
        assert_eq!(active.music_play_pause, "Pause music");
    }
}
