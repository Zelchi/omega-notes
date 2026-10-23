use tauri::Manager;

#[cfg(target_os = "linux")]
fn send_x11_moveresize(window: &tauri::Window, direction: u32) -> Result<bool, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use x11rb::{
        connection::Connection,
        protocol::xproto::{ClientMessageEvent, ConnectionExt, EventMask},
    };

    let handle = window
        .window_handle()
        .map_err(|error| error.to_string())?
        .as_raw();
    let xid = match handle {
        RawWindowHandle::Xlib(handle) => handle.window as u32,
        RawWindowHandle::Xcb(handle) => handle.window.get(),
        _ => return Ok(false),
    };

    let (connection, screen_num) = x11rb::connect(None).map_err(|error| error.to_string())?;
    let root = connection
        .setup()
        .roots
        .get(screen_num)
        .ok_or_else(|| "X11 screen not found".to_string())?
        .root;
    let pointer = connection
        .query_pointer(root)
        .map_err(|error| error.to_string())?
        .reply()
        .map_err(|error| error.to_string())?;
    let moveresize = connection
        .intern_atom(false, b"_NET_WM_MOVERESIZE")
        .map_err(|error| error.to_string())?
        .reply()
        .map_err(|error| error.to_string())?
        .atom;
    let event = ClientMessageEvent::new(
        32,
        xid,
        moveresize,
        [
            pointer.root_x as u32,
            pointer.root_y as u32,
            direction,
            1,
            1,
        ],
    );

    connection
        .send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )
        .map_err(|error| error.to_string())?
        .check()
        .map_err(|error| error.to_string())?;
    connection.flush().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub(crate) fn start_window_drag(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if send_x11_moveresize(&window, 8)? {
            Ok(())
        } else {
            window.start_dragging().map_err(|error| error.to_string())
        }
    }

    #[cfg(not(target_os = "linux"))]
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn start_window_resize(
    window: tauri::Window,
    direction: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let edge = match direction.as_str() {
            "NorthWest" => gtk::gdk::SurfaceEdge::NorthWest,
            "North" => gtk::gdk::SurfaceEdge::North,
            "NorthEast" => gtk::gdk::SurfaceEdge::NorthEast,
            "East" => gtk::gdk::SurfaceEdge::East,
            "SouthEast" => gtk::gdk::SurfaceEdge::SouthEast,
            "South" => gtk::gdk::SurfaceEdge::South,
            "SouthWest" => gtk::gdk::SurfaceEdge::SouthWest,
            "West" => gtk::gdk::SurfaceEdge::West,
            _ => return Err("Invalid window resize direction".to_string()),
        };

        let resize_window = window.clone();
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        window
            .run_on_main_thread(move || {
                let result = begin_gtk_resize(&resize_window, edge, x, y);
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;

        tauri::async_runtime::spawn_blocking(move || receiver.recv())
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, direction, x, y);
        Err("Window resize command is only available on Linux".to_string())
    }
}

#[cfg(target_os = "linux")]
fn begin_gtk_resize(
    window: &tauri::Window,
    edge: gtk::gdk::SurfaceEdge,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use gtk::{gdk::prelude::ToplevelExt, prelude::*};

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    let surface = gtk_window
        .surface()
        .ok_or_else(|| "GTK window has no GDK surface".to_string())?;
    let toplevel = surface
        .clone()
        .downcast::<gtk::gdk::Toplevel>()
        .map_err(|_| "GTK window surface does not support resizing".to_string())?;
    let x11_surface = surface
        .downcast::<gdk4_x11::X11Surface>()
        .map_err(|_| "GTK resize requires the X11 backend".to_string())?;
    let pointer = gtk::prelude::WidgetExt::display(&gtk_window)
        .default_seat()
        .and_then(|seat| seat.pointer())
        .ok_or_else(|| "GTK pointer device is unavailable".to_string())?;

    // CEF's X11 child does not deliver its click event to GTK; GDK needs a fresh X11 timestamp.
    #[allow(deprecated)]
    let timestamp = gdk4_x11::x11_get_server_time(&x11_surface);
    toplevel.begin_resize(edge, Some(&pointer), 1, x, y, timestamp);
    Ok(())
}
