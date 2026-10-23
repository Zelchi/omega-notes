use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

#[derive(Default)]
pub(crate) struct TrayState(Mutex<Option<TrayMenu>>);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrayLabels {
    show: String,
    hide: String,
    start: String,
    pause: String,
    reset: String,
    next: String,
    update: String,
    exit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            show: "Show".into(),
            hide: "Hide".into(),
            start: "Start".into(),
            pause: "Pause".into(),
            reset: "Reset".into(),
            next: "Next".into(),
            update: "Update".into(),
            exit: "Exit".into(),
        }
    }
}

struct TrayMenu {
    labels: TrayLabels,
    visible: MenuItem<tauri::DynRuntime>,
    pomodoro: MenuItem<tauri::DynRuntime>,
    reset: MenuItem<tauri::DynRuntime>,
    next: MenuItem<tauri::DynRuntime>,
    update: MenuItem<tauri::DynRuntime>,
    exit: MenuItem<tauri::DynRuntime>,
}

fn menu_state(state: &TrayState) -> Result<std::sync::MutexGuard<'_, Option<TrayMenu>>, String> {
    state.0.lock().map_err(|_| "TRAY_MENU_FAILED".into())
}

fn set_visible_label(state: &TrayState, visible: bool) -> Result<(), String> {
    if let Some(menu) = menu_state(state)?.as_ref() {
        menu.visible
            .set_text(if visible {
                &menu.labels.hide
            } else {
                &menu.labels.show
            })
            .map_err(|_| "TRAY_MENU_FAILED")?;
    }
    Ok(())
}

fn refresh_visible_label(app: &AppHandle, visible: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = set_visible_label(&app.state::<TrayState>(), visible) {
            eprintln!("Could not update tray visibility label: {error}");
        }
    });
}

fn set_window_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "MAIN_WINDOW_NOT_FOUND".to_string())?;
    if visible {
        window.show().map_err(|_| "WINDOW_SHOW_FAILED")?;
        window.set_focus().map_err(|_| "WINDOW_FOCUS_FAILED")?;
    } else {
        window.hide().map_err(|_| "WINDOW_HIDE_FAILED")?;
    }
    refresh_visible_label(app, visible);
    Ok(())
}

fn toggle_window(app: &AppHandle) {
    let visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if let Err(error) = set_window_visible(app, !visible) {
        eprintln!("Could not toggle the main window from the tray: {error}");
    }
}

fn emit_action(app: &AppHandle, action: &str) {
    if let Err(error) = app.emit("omega-tray-action", action) {
        eprintln!("Could not dispatch tray action: {error}");
    }
}

pub(crate) fn initialize(app: &tauri::App) -> tauri::Result<()> {
    let labels = TrayLabels::default();
    let visible = MenuItem::with_id(app, "visibility", &labels.hide, true, None::<&str>)?;
    let pomodoro = MenuItem::with_id(app, "pomodoro-toggle", &labels.start, true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "pomodoro-reset", &labels.reset, true, None::<&str>)?;
    let next = MenuItem::with_id(app, "pomodoro-next", &labels.next, true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", &labels.update, true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", &labels.exit, true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &visible,
            &separator_one,
            &pomodoro,
            &reset,
            &next,
            &separator_two,
            &update,
            &separator_three,
            &exit,
        ],
    )?;

    *menu_state(&app.state::<TrayState>()).map_err(std::io::Error::other)? = Some(TrayMenu {
        labels,
        visible,
        pomodoro,
        reset,
        next,
        update,
        exit,
    });

    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "default tray icon is missing")
    })?;
    TrayIconBuilder::with_id("omega-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "visibility" => toggle_window(app),
            "pomodoro-toggle" => emit_action(app, "pomodoro-toggle"),
            "pomodoro-reset" => emit_action(app, "pomodoro-reset"),
            "pomodoro-next" => emit_action(app, "pomodoro-next"),
            "update" => {
                if let Err(error) = set_window_visible(app, true) {
                    eprintln!("Could not show the app for update: {error}");
                } else {
                    emit_action(app, "update");
                }
            }
            "exit" => emit_action(app, "exit"),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    set_window_visible(&app, false)
}

#[tauri::command]
pub(crate) async fn show_main_window(app: AppHandle) -> Result<(), String> {
    set_window_visible(&app, true)
}

#[tauri::command]
pub(crate) fn exit_main_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub(crate) async fn configure_tray_menu(
    app: AppHandle,
    state: State<'_, TrayState>,
    labels: TrayLabels,
    pomodoro_running: bool,
) -> Result<(), String> {
    if [
        &labels.show,
        &labels.hide,
        &labels.start,
        &labels.pause,
        &labels.reset,
        &labels.next,
        &labels.update,
        &labels.exit,
    ]
    .iter()
    .any(|label| label.trim().is_empty() || label.chars().count() > 80)
    {
        return Err("TRAY_MENU_FAILED".into());
    }

    let visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(true);
    let mut menu_state = menu_state(&state)?;
    let Some(menu) = menu_state.as_mut() else {
        return Ok(());
    };
    menu.labels = labels;
    menu.visible
        .set_text(if visible {
            &menu.labels.hide
        } else {
            &menu.labels.show
        })
        .map_err(|_| "TRAY_MENU_FAILED")?;
    menu.pomodoro
        .set_text(if pomodoro_running {
            &menu.labels.pause
        } else {
            &menu.labels.start
        })
        .map_err(|_| "TRAY_MENU_FAILED")?;
    menu.reset
        .set_text(&menu.labels.reset)
        .map_err(|_| "TRAY_MENU_FAILED")?;
    menu.next
        .set_text(&menu.labels.next)
        .map_err(|_| "TRAY_MENU_FAILED")?;
    menu.update
        .set_text(&menu.labels.update)
        .map_err(|_| "TRAY_MENU_FAILED")?;
    menu.exit
        .set_text(&menu.labels.exit)
        .map_err(|_| "TRAY_MENU_FAILED".to_string())
}
