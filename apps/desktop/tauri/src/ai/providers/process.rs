use std::{
    ffi::OsString,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

pub(super) struct Executable {
    pub(super) program: PathBuf,
    pub(super) arguments: Vec<OsString>,
}

pub(super) fn executable(name: &str) -> Result<Executable, String> {
    if let Some(program) = native_executable(name) {
        return Ok(Executable {
            program,
            arguments: vec![],
        });
    }
    #[cfg(windows)]
    for prefix in npm_prefixes() {
        if name == "opencode" {
            let package = prefix.join("node_modules/opencode-ai");
            for native in [
                package.join("bin/opencode.exe"),
                package.join("bin/opencode"),
            ] {
                if is_executable(&native) {
                    return Ok(Executable {
                        program: native,
                        arguments: vec![],
                    });
                }
            }
        }
        if name == "claude" {
            let npm = prefix.join("node_modules/@anthropic-ai");
            let platform = if cfg!(target_arch = "aarch64") {
                "claude-code-win32-arm64"
            } else {
                "claude-code-win32-x64"
            };
            for native in [
                npm.join("claude-code/bin/claude.exe"),
                npm.join("claude-code/node_modules/@anthropic-ai")
                    .join(platform)
                    .join("claude.exe"),
                npm.join(platform).join("claude.exe"),
            ] {
                if is_executable(&native) {
                    return Ok(Executable {
                        program: native,
                        arguments: vec![],
                    });
                }
            }
        }
        let package = match name {
            "claude" => "@anthropic-ai/claude-code/cli.js",
            "opencode" => "opencode-ai/bin/opencode",
            _ => return Err("AI_NOT_FOUND".into()),
        };
        let script = prefix.join("node_modules").join(package);
        if script.is_file() {
            if let Some(program) = native_executable("node") {
                return Ok(Executable {
                    program,
                    arguments: vec![script.into_os_string()],
                });
            }
        }
    }
    Err("AI_NOT_FOUND".into())
}

#[cfg(windows)]
fn npm_prefixes() -> Vec<PathBuf> {
    let mut prefixes: Vec<_> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let prefix = PathBuf::from(appdata).join("npm");
        if !prefixes.contains(&prefix) {
            prefixes.push(prefix);
        }
    }
    prefixes
}

fn native_executable(name: &str) -> Option<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    let mut directories: Vec<_> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        directories.extend([
            home.join(".local/bin"),
            home.join("bin"),
            home.join(".opencode/bin"),
            home.join(".bun/bin"),
        ]);
    }
    if name == "agy" {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            directories.push(PathBuf::from(local).join("agy/bin"));
        }
        if let Some(programs) = std::env::var_os("ProgramFiles") {
            directories.push(PathBuf::from(programs).join("Google/antigravity-cli"));
        }
    }
    if let Some(directory) = std::env::var_os("OPENCODE_INSTALL_DIR") {
        directories.push(directory.into());
    }
    if let Some(directory) = std::env::var_os("XDG_BIN_DIR") {
        directories.push(directory.into());
    }
    directories
        .into_iter()
        .map(|directory| directory.join(&filename))
        .find(|path| is_executable(path))
}

pub(super) fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(windows)]
    {
        let mut header = [0; 2];
        if !std::fs::File::open(path).is_ok_and(|mut file| file.read_exact(&mut header).is_ok())
            || header != *b"MZ"
        {
            return false;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return false;
        }
    }
    true
}

pub(super) fn command(binary: &Executable) -> Command {
    let mut command = Command::new(&binary.program);
    command.args(&binary.arguments);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
}

pub(super) fn stop(child: &mut Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let _ = command(&Executable {
            program: PathBuf::from("taskkill.exe"),
            arguments: vec![],
        })
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

pub(super) fn output(mut command: Command) -> Result<(bool, String), String> {
    let mut child = command.spawn().map_err(|_| "AI_START_FAILED")?;
    let stdout = child.stdout.take().ok_or("AI_START_FAILED")?;
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(2 * 1024 * 1024 + 1).read_to_end(&mut bytes);
        let _ = send.send((result, bytes));
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let (result, bytes) = receive
                    .recv_timeout(Duration::from_secs(2))
                    .map_err(|_| "AI_PROTOCOL_ERROR")?;
                result.map_err(|_| "AI_PROTOCOL_ERROR")?;
                if bytes.len() > 2 * 1024 * 1024 {
                    return Err("AI_PROTOCOL_ERROR".into());
                }
                return Ok((status.success(), String::from_utf8_lossy(&bytes).into()));
            }
            Err(_) => {
                stop(&mut child);
                return Err("AI_REQUEST_FAILED".into());
            }
            Ok(None) if started.elapsed() > Duration::from_secs(30) => {
                stop(&mut child);
                return Err("AI_TIMEOUT".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}
