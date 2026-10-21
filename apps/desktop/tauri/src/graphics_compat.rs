#[cfg(target_os = "linux")]
use std::{env, fs, path::Path};

/// Desativa o renderizador DMA-BUF do WebKitGTK em NVIDIA + Wayland antes de inicializar o GTK.
pub fn configure_nvidia_wayland() {
    #[cfg(target_os = "linux")]
    {
        if !is_wayland_session() || !uses_nvidia_driver() {
            return;
        }

        if [
            "__NV_DISABLE_EXPLICIT_SYNC",
            "WEBKIT_DISABLE_DMABUF_RENDERER",
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            "WEBKIT_DMABUF_RENDERER_FORCE_SHM",
        ]
        .iter()
        .any(|key| env::var_os(key).is_some())
        {
            return;
        }

        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        eprintln!("Omega Notes: NVIDIA + Wayland detected; WebKitGTK DMA-BUF renderer disabled.");
    }
}

#[cfg(target_os = "linux")]
fn is_wayland_session() -> bool {
    if let Ok(backends) = env::var("GDK_BACKEND") {
        for backend in backends.split(',').map(str::trim) {
            match backend {
                "wayland" => return true,
                "x11" => return false,
                _ => {}
            }
        }
    }

    match env::var("XDG_SESSION_TYPE").as_deref() {
        Ok("wayland") => return true,
        Ok("x11") => return false,
        _ => {}
    }
    env::var_os("WAYLAND_DISPLAY").is_some() || env::var_os("WAYLAND_SOCKET").is_some()
}

#[cfg(target_os = "linux")]
fn uses_nvidia_driver() -> bool {
    let drm_root = Path::new("/sys/class/drm");
    let Ok(entries) = fs::read_dir(drm_root) else {
        return false;
    };
    let prime_offload = env::var_os("__NV_PRIME_RENDER_OFFLOAD").is_some();
    let mut cards = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with("card") || name.contains('-') {
            continue;
        }
        let path = entry.path();
        let vendor = fs::read_to_string(path.join("device/vendor")).ok();
        let driver = fs::read_link(path.join("device/driver")).ok();
        let nvidia = vendor
            .as_deref()
            .is_some_and(|value| value.trim().eq_ignore_ascii_case("0x10de"))
            && driver
                .as_deref()
                .and_then(Path::file_name)
                .is_some_and(|value| value == "nvidia");
        let primary = ["boot_vga", "boot_display"].iter().any(|key| {
            fs::read_to_string(path.join("device").join(key))
                .ok()
                .is_some_and(|value| value.trim() == "1")
        });
        cards.push((nvidia, primary));
    }

    let has_primary = cards.iter().any(|(_, primary)| *primary);
    if prime_offload || !has_primary {
        cards.iter().any(|(nvidia, _)| *nvidia)
    } else {
        cards.iter().any(|(nvidia, primary)| *nvidia && *primary)
    }
}
