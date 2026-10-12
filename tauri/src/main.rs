#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Configure WebKitGTK before Tauri starts GTK or creates worker threads.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    omega_notes_lib::run();
}
