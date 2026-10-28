#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use omega_notes_lib::DesktopBackend;
use serde_json::{json, Value};
use std::{io, io::Write, sync::Mutex};
use tauri::{
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
            .is_some_and(|window| window.is_visible().unwrap_or(true));
        self.visibility
            .set_text(if visible { labels.hide } else { labels.show })
            .map_err(|error| error.to_string())?;
        self.pomodoro
            .set_text(if running { labels.pause } else { labels.start })
            .map_err(|error| error.to_string())?;
        self.reset
            .set_text(labels.reset)
            .map_err(|error| error.to_string())?;
        self.music_play_pause
            .set_text(if music_playing {
                labels.music_pause
            } else {
                labels.music_play
            })
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
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
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
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                show_window(app);
                            }
                        }
                        if let Some(tray) = app.try_state::<TrayMenuState>() {
                            let _ = tray.refresh(app);
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
            tauri::WindowEvent::Resized(_) => {
                let _ = window.emit(
                    "omega:event",
                    json!({"event":"window-resized","payload":null}),
                );
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            desktop_dispatch,
            exit_app,
            relaunch_app,
            configure_tray_menu
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o host Tauri");
}
