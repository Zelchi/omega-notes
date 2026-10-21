use std::{
    ffi::OsString,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

#[derive(Clone)]
pub(super) struct Executable {
    pub(super) program: PathBuf,
    pub(super) arguments: Vec<OsString>,
}

pub(super) fn executable(name: &str) -> Result<Executable, String> {
    if name == "opencode" {
        return opencode_executable();
    }
    if let Some(program) = native_executable(name) {
        return Ok(Executable {
            program,
            arguments: vec![],
        });
    }
    #[cfg(windows)]
    for prefix in npm_prefixes() {
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
        let scripts = match name {
            "claude" => vec![prefix.join("node_modules/@anthropic-ai/claude-code/cli.js")],
            _ => return Err("AI_NOT_FOUND".into()),
        };
        for script in scripts {
            if script.is_file() {
                if let Some(program) = native_executable("node") {
                    return Ok(Executable {
                        program,
                        arguments: vec![script.into_os_string()],
                    });
                }
            }
        }
    }
    Err("AI_NOT_FOUND".into())
}

fn opencode_executable() -> Result<Executable, String> {
    let mut candidates = Vec::new();
    #[cfg(windows)]
    let prefixes = npm_prefixes();
    #[cfg(windows)]
    {
        let architecture = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x64"
        };
        for prefix in &prefixes {
            candidates.extend(
                opencode_v2_package_binaries(prefix, architecture)
                    .into_iter()
                    .filter(|path| is_executable(path))
                    .map(|program| Executable {
                        program,
                        arguments: vec![],
                    }),
            );
        }
        if let Some(node) = native_executable("node") {
            for prefix in &prefixes {
                candidates.extend(
                    opencode_v2_package_scripts(prefix)
                        .into_iter()
                        .filter(|path| path.is_file())
                        .map(|script| Executable {
                            program: node.clone(),
                            arguments: vec![script.into_os_string()],
                        }),
                );
            }
        }
    }
    candidates.extend(
        native_executable_candidates("opencode")
            .into_iter()
            .map(|program| Executable {
                program,
                arguments: vec![],
            }),
    );

    #[cfg(windows)]
    {
        let architecture = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x64"
        };
        for prefix in &prefixes {
            candidates.extend(
                opencode_v1_package_binaries(prefix, architecture)
                    .into_iter()
                    .filter(|path| is_executable(path))
                    .map(|program| Executable {
                        program,
                        arguments: vec![],
                    }),
            );
        }
        if let Some(node) = native_executable("node") {
            for prefix in &prefixes {
                candidates.extend(
                    opencode_v1_package_scripts(prefix)
                        .into_iter()
                        .filter(|path| path.is_file())
                        .map(|script| Executable {
                            program: node.clone(),
                            arguments: vec![script.into_os_string()],
                        }),
                );
            }
        }
    }

    select_opencode_candidate(candidates, opencode_is_v2).ok_or_else(|| "AI_NOT_FOUND".into())
}

fn unique_executables(candidates: Vec<Executable>) -> Vec<Executable> {
    let mut unique = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        if !unique.iter().any(|existing: &Executable| {
            existing.program == candidate.program && existing.arguments == candidate.arguments
        }) {
            unique.push(candidate);
        }
    }
    unique
}

fn opencode_is_v2(binary: &Executable) -> Option<bool> {
    let mut version = command(binary);
    version.arg("--version");
    let (success, output) = output_with_timeout(version, Duration::from_secs(2)).ok()?;
    success.then(|| super::opencode_catalog::is_v2(&output))
}

fn select_opencode_candidate(
    candidates: Vec<Executable>,
    mut is_v2: impl FnMut(&Executable) -> Option<bool>,
) -> Option<Executable> {
    let mut fallback = None;
    let mut unverified = None;
    for candidate in unique_executables(candidates) {
        match is_v2(&candidate) {
            Some(true) => return Some(candidate),
            Some(false) if fallback.is_none() => fallback = Some(candidate),
            None if unverified.is_none() => unverified = Some(candidate),
            _ => {}
        }
    }
    fallback.or(unverified)
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
    if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
        let local_appdata = PathBuf::from(local_appdata);
        let pnpm_global = local_appdata.join("pnpm/global");
        if let Ok(entries) = std::fs::read_dir(pnpm_global) {
            prefixes.extend(entries.flatten().filter_map(|entry| {
                entry
                    .file_type()
                    .ok()
                    .filter(|kind| kind.is_dir())
                    .map(|_| entry.path())
            }));
        }
        prefixes.push(local_appdata.join("Yarn/Data/global"));
    }
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        prefixes.push(PathBuf::from(user_profile).join(".yarn/global"));
    }
    prefixes
}

#[cfg(any(windows, test))]
fn opencode_v2_package_binaries(prefix: &Path, architecture: &str) -> Vec<PathBuf> {
    let modules = prefix.join("node_modules");
    let v2 = modules.join("@opencode").join("cli");
    let v2_platform = modules
        .join("@opencode")
        .join(format!("cli-win32-{architecture}"));
    [
        v2_platform,
        v2.join("node_modules")
            .join("@opencode")
            .join(format!("cli-win32-{architecture}")),
        v2,
    ]
    .into_iter()
    .flat_map(opencode_package_binary_names)
    .collect()
}

#[cfg(any(windows, test))]
fn opencode_v1_package_binaries(prefix: &Path, architecture: &str) -> Vec<PathBuf> {
    let modules = prefix.join("node_modules");
    let package = modules.join("opencode-ai");
    let platforms = if architecture == "arm64" {
        ["opencode-windows-arm64", "opencode-win32-arm64"]
    } else {
        ["opencode-windows-x64", "opencode-win32-x64"]
    };
    let mut packages = vec![package.clone()];
    for platform in platforms {
        packages.push(modules.join(platform));
        packages.push(package.join("node_modules").join(platform));
    }
    packages
        .into_iter()
        .flat_map(opencode_package_binary_names)
        .collect()
}

#[cfg(any(windows, test))]
fn opencode_package_binary_names(package: PathBuf) -> [PathBuf; 2] {
    [
        package.join("bin/opencode.exe"),
        package.join("bin/opencode"),
    ]
}

#[cfg(any(windows, test))]
fn opencode_v2_package_scripts(prefix: &Path) -> Vec<PathBuf> {
    ["@opencode/cli/bin/opencode"]
        .into_iter()
        .map(|package_path| prefix.join("node_modules").join(package_path))
        .collect()
}

#[cfg(any(windows, test))]
fn opencode_v1_package_scripts(prefix: &Path) -> Vec<PathBuf> {
    ["opencode-ai/bin/opencode"]
        .into_iter()
        .map(|package_path| prefix.join("node_modules").join(package_path))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        opencode_v1_package_binaries, opencode_v1_package_scripts, opencode_v2_package_binaries,
        opencode_v2_package_scripts, select_opencode_candidate, Executable,
    };
    use std::path::Path;

    #[test]
    fn opencode_detection_searches_v2_package_before_v1_fallback() {
        let prefix = Path::new("C:/Users/test/AppData/Roaming/npm");
        let v2_binaries = opencode_v2_package_binaries(prefix, "x64");
        let v1_binaries = opencode_v1_package_binaries(prefix, "x64");
        assert!(v2_binaries
            .contains(&prefix.join("node_modules/@opencode/cli-win32-x64/bin/opencode.exe")));
        assert!(v2_binaries.contains(&prefix.join("node_modules/@opencode/cli/bin/opencode.exe")));
        assert!(v1_binaries.contains(&prefix.join("node_modules/opencode-ai/bin/opencode.exe")));
        assert!(v1_binaries.contains(
            &prefix.join(
                "node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe"
            )
        ));
        assert!(v2_binaries.iter().all(|v2| !v1_binaries.contains(v2)));

        let v2_scripts = opencode_v2_package_scripts(prefix);
        let v1_scripts = opencode_v1_package_scripts(prefix);
        assert!(v2_scripts.contains(&prefix.join("node_modules/@opencode/cli/bin/opencode")));
        assert!(v1_scripts.contains(&prefix.join("node_modules/opencode-ai/bin/opencode")));
    }

    #[test]
    fn opencode_detection_uses_the_windows_arm64_package_name() {
        let prefix = Path::new("C:/Users/test/AppData/Roaming/npm");
        let v2_binaries = opencode_v2_package_binaries(prefix, "arm64");
        let v1_binaries = opencode_v1_package_binaries(prefix, "arm64");
        assert!(v2_binaries
            .contains(&prefix.join("node_modules/@opencode/cli-win32-arm64/bin/opencode.exe")));
        assert!(v1_binaries
            .contains(&prefix.join("node_modules/opencode-windows-arm64/bin/opencode.exe")));
    }

    #[test]
    fn opencode_resolution_prefers_v2_then_uses_v1_as_fallback() {
        let v1 = Executable {
            program: Path::new("C:/tools/opencode-v1.exe").into(),
            arguments: vec![],
        };
        let v2 = Executable {
            program: Path::new("C:/tools/opencode-v2.exe").into(),
            arguments: vec![],
        };
        let selected = select_opencode_candidate(vec![v1.clone(), v2.clone()], |candidate| {
            Some(candidate.program == v2.program)
        })
        .unwrap();
        assert_eq!(selected.program, v2.program);

        let selected = select_opencode_candidate(vec![v1.clone()], |_| Some(false)).unwrap();
        assert_eq!(selected.program, v1.program);
    }
}

fn native_executable(name: &str) -> Option<PathBuf> {
    native_executable_candidates(name).into_iter().next()
}

fn native_executable_candidates(name: &str) -> Vec<PathBuf> {
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
        .filter(|path| is_executable(path))
        .collect()
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

pub(super) fn output(command: Command) -> Result<(bool, String), String> {
    output_with_timeout(command, Duration::from_secs(30))
}

pub(super) fn output_with_timeout(
    mut command: Command,
    timeout: Duration,
) -> Result<(bool, String), String> {
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
            Ok(None) if started.elapsed() > timeout => {
                stop(&mut child);
                return Err("AI_TIMEOUT".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}
