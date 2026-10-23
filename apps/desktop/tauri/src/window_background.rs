#[tauri::command]
pub(crate) fn set_window_background_color(
    window: tauri::Window,
    color: tauri::window::Color,
) -> Result<(), String> {
    window
        .set_background_color(Some(color))
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "linux")]
    set_cef_host_background(&window, color)?;

    Ok(())
}

#[cfg(target_os = "linux")]
fn set_cef_host_background(
    window: &tauri::Window,
    color: tauri::window::Color,
) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use x11rb::{
        connection::Connection,
        protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt, WindowClass},
    };

    let handle = window.window_handle().map_err(|error| error.to_string())?;
    let xid = match handle.as_raw() {
        RawWindowHandle::Xlib(handle) => handle.window as u32,
        RawWindowHandle::Xcb(handle) => handle.window.get(),
        _ => return Ok(()),
    };
    let (connection, _) = x11rb::connect(None).map_err(|error| error.to_string())?;
    let children = connection
        .query_tree(xid)
        .map_err(|error| error.to_string())?
        .reply()
        .map_err(|error| error.to_string())?
        .children;

    // O host X11 do CEF é filho direto; não alteramos as superfícies internas do Chromium.
    for target in std::iter::once(xid).chain(children) {
        let attributes = connection
            .get_window_attributes(target)
            .map_err(|error| error.to_string())?
            .reply()
            .map_err(|error| error.to_string())?;
        if attributes.class != WindowClass::INPUT_OUTPUT || attributes.colormap == 0 {
            continue;
        }
        let pixel = connection
            .alloc_color(
                attributes.colormap,
                u16::from(color.0) * 257,
                u16::from(color.1) * 257,
                u16::from(color.2) * 257,
            )
            .map_err(|error| error.to_string())?
            .reply()
            .map_err(|error| error.to_string())?
            .pixel;
        connection
            .change_window_attributes(
                target,
                &ChangeWindowAttributesAux::new().background_pixel(pixel),
            )
            .map_err(|error| error.to_string())?
            .check()
            .map_err(|error| error.to_string())?;
        if target != xid {
            connection
                .clear_area(false, target, 0, 0, 0, 0)
                .map_err(|error| error.to_string())?
                .check()
                .map_err(|error| error.to_string())?;
        }
    }
    connection.flush().map_err(|error| error.to_string())
}
