use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, Manager};

mod conversations;
mod hooks;
pub(crate) use hooks::run_if_requested;
mod instructions;
pub(crate) mod studies;

const OUTPUT_WINDOW: u64 = 128 * 1024;

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TerminalProvider {
    Codex,
    Claude,
    Opencode,
    Antigravity,
}
impl TerminalProvider {
    fn command(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Opencode => "opencode",
            Self::Antigravity => "agy",
        }
    }
}

fn shell_command(app: &AppHandle, arguments: &[String]) -> Result<CommandBuilder, String> {
    let (provider, flags) = arguments.split_first().ok_or("TERMINAL_START_FAILED")?;
    let mut resolved = crate::ai::terminal_command(provider)?;
    resolved.extend_from_slice(flags);
    let invocation = hooks::shell_invocation(&resolved)?;
    let mut command = CommandBuilder::new_default_prog();
    #[cfg(unix)]
    {
        let shell = command.get_shell();
        match std::path::Path::new(&shell)
            .file_name()
            .and_then(|name| name.to_str())
        {
            Some("bash") => {
                let directory = app
                    .path()
                    .app_cache_dir()
                    .map_err(|_| "TERMINAL_START_FAILED")?
                    .join("terminal");
                std::fs::create_dir_all(&directory).map_err(|_| "TERMINAL_START_FAILED")?;
                let startup = directory.join("bashrc");
                std::fs::write(&startup, include_str!("prompt.bash"))
                    .map_err(|_| "TERMINAL_START_FAILED")?;
                command = CommandBuilder::new(&shell);
                command.arg("--rcfile");
                command.arg(startup);
                command.arg("-i");
            }
            Some("fish") => {
                command = CommandBuilder::new(&shell);
                command.arg("--login");
                command.arg("--init-command");
                command.arg(
                    "function fish_prompt; printf '%s@%s: ' (whoami) (prompt_hostname); end; function fish_right_prompt; end",
                );
            }
            _ => {
                command = CommandBuilder::new(&shell);
                command.arg("-i");
            }
        }
        command.arg("-c");
        command.arg(format!("exec {invocation}"));
    }
    #[cfg(not(unix))]
    let _ = app;
    #[cfg(unix)]
    {
        command.env("PS1", r"\u@\h: ");
        command.env("PROMPT", "%n@%m: ");
    }
    #[cfg(windows)]
    {
        let shell = command.get_shell();
        command = CommandBuilder::new(shell);
        command.arg("/S");
        command.arg("/C");
        command.arg(format!("call {invocation}"));
    }
    #[cfg(windows)]
    command.env(
        "PROMPT",
        format!(
            "{}@{}:$S",
            std::env::var("USERNAME").unwrap_or_default(),
            std::env::var("COMPUTERNAME").unwrap_or_default(),
        ),
    );
    Ok(command)
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum TerminalEvent {
    Data { bytes: Vec<u8>, sequence: u64 },
    Exit { code: Option<u32> },
    CliExit { code: Option<u32> },
    Error,
}
#[derive(Default)]
struct Flow {
    sent: u64,
    acknowledged: u64,
}
struct Session {
    id: String,
    vault_id: String,
    notes_directory: PathBuf,
    forget_epoch: u64,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    stopped: AtomicBool,
    child_exited: AtomicBool,
    flow: Mutex<Flow>,
    wake: Condvar,
}
impl Session {
    fn signal_stop(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        self.wake.notify_all();
        #[cfg(unix)]
        if let Ok(master) = self.master.lock() {
            if let Some(group) = master.as_ref().and_then(|pty| pty.process_group_leader()) {
                if group > 1 && group != unsafe { libc::getpgrp() } {
                    unsafe {
                        libc::kill(-group, libc::SIGHUP);
                    }
                }
            }
        }
        if !self.child_exited.load(Ordering::SeqCst) {
            if let Ok(mut killer) = self.killer.lock() {
                let _ = killer.kill();
            }
        }
    }
    fn close_handles(&self) {
        if let Ok(mut writer) = self.writer.lock() {
            writer.take();
        }
        if let Ok(mut master) = self.master.lock() {
            master.take();
        }
    }
    fn stop(&self) {
        self.signal_stop();
        self.close_handles();
    }
}
#[derive(Default)]
pub(crate) struct TerminalState {
    session: Mutex<Option<Arc<Session>>>,
    operation: Mutex<()>,
    revision: AtomicU64,
    forget_epoch: AtomicU64,
    instructions: Mutex<Option<PathBuf>>,
    study_request: Mutex<Option<studies::Request>>,
}

#[tauri::command]
pub(crate) async fn terminal_sync_instructions(
    app: AppHandle,
    vault_id: Option<String>,
    enabled: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<TerminalState>();
        let _operation = state.operation.lock().map_err(|_| "TERMINAL_FAILED")?;
        let root = vault_id
            .as_deref()
            .map(|id| {
                let notes = crate::ai::terminal_vault_directory(&app, id)?;
                notes
                    .parent()
                    .map(PathBuf::from)
                    .ok_or_else(|| "TERMINAL_FAILED".to_string())
            })
            .transpose()?;
        let mut previous = state.instructions.lock().map_err(|_| "TERMINAL_FAILED")?;
        if !enabled || previous.as_ref() != root.as_ref() {
            if enabled {
                state.shutdown();
            } else {
                state.shutdown_and_forget_conversations();
                let app_directory = crate::app::runtime::app_directory(&app)?;
                let registry = crate::vaults::read_vault_registry(&app_directory)?;
                let vault_ids = registry
                    .vaults
                    .iter()
                    .map(|vault| vault.id.clone())
                    .collect::<Vec<_>>();
                conversations::clear_all(&app_directory, &vault_ids)?;
            }
            studies::clear(&state)?;
        }
        if previous.as_ref() != root.as_ref() || !enabled {
            if let Some(path) = previous.as_ref() {
                instructions::sync(path, false)?;
            }
            *previous = None;
        }
        if let Some(root) = root {
            if enabled {
                *previous = Some(root.clone());
            }
            instructions::sync(&root, enabled)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}
impl TerminalState {
    pub(crate) fn shutdown(&self) {
        self.stop();
    }
    fn shutdown_and_forget_conversations(&self) {
        self.forget_epoch.fetch_add(1, Ordering::SeqCst);
        self.stop();
    }
    fn stop(&self) {
        self.revision.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut slot) = self.session.lock() {
            if let Some(session) = slot.take() {
                session.signal_stop();
                tauri::async_runtime::spawn_blocking(move || session.close_handles());
            }
        }
    }
    pub(crate) fn close_vault(&self, vault_id: &str) -> Result<(), String> {
        let _operation = self.operation.lock().map_err(|_| "TERMINAL_FAILED")?;
        let removed = {
            let mut slot = self.session.lock().map_err(|_| "TERMINAL_FAILED")?;
            if slot
                .as_ref()
                .is_some_and(|value| value.vault_id == vault_id)
            {
                self.revision.fetch_add(1, Ordering::SeqCst);
                slot.take()
            } else {
                None
            }
        };
        if let Some(current) = removed {
            current.stop();
        }
        Ok(())
    }
}
impl Drop for TerminalState {
    fn drop(&mut self) {
        if let Ok(slot) = self.session.get_mut() {
            if let Some(session) = slot.take() {
                session.stop();
            }
        }
    }
}
fn size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("TERMINAL_INVALID_SIZE".into());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}
fn session(app: &AppHandle, vault_id: &str, session_id: &str) -> Result<Arc<Session>, String> {
    let current = app
        .state::<TerminalState>()
        .session
        .lock()
        .map_err(|_| "TERMINAL_FAILED")?
        .as_ref()
        .filter(|value| value.id == session_id && value.vault_id == vault_id)
        .cloned()
        .ok_or("TERMINAL_CLOSED")?;
    if current.stopped.load(Ordering::SeqCst)
        || crate::app::runtime::notes_dir(app)? != current.notes_directory
    {
        return Err("TERMINAL_CLOSED".into());
    }
    Ok(current)
}

#[tauri::command]
pub(crate) async fn terminal_open(
    app: AppHandle,
    vault_id: String,
    session_id: String,
    provider_id: TerminalProvider,
    cols: u16,
    rows: u16,
    output: Channel<TerminalEvent>,
) -> Result<(), String> {
    let revision = app.state::<TerminalState>().revision.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        uuid::Uuid::parse_str(&session_id).map_err(|_| "TERMINAL_FAILED")?;
        let state = app.state::<TerminalState>();
        let _operation = state.operation.lock().map_err(|_| "TERMINAL_FAILED")?;
        if state.revision.load(Ordering::SeqCst) != revision {
            return Err("TERMINAL_CLOSED".into());
        }
        if state
            .session
            .lock()
            .map_err(|_| "TERMINAL_FAILED")?
            .is_some()
        {
            return Err("TERMINAL_BUSY".into());
        }
        let directory = crate::ai::terminal_vault_directory(&app, &vault_id)?;
        let root = directory.parent().ok_or("TERMINAL_FAILED")?;
        if state
            .instructions
            .lock()
            .map_err(|_| "TERMINAL_FAILED")?
            .as_deref()
            != Some(root)
        {
            return Err("TERMINAL_CLOSED".into());
        }
        let launch = conversations::prepare(&app, &vault_id, root, provider_id, &session_id)?;
        if state.revision.load(Ordering::SeqCst) != revision {
            return Err("TERMINAL_CLOSED".into());
        }
        let pair = native_pty_system()
            .openpty(size(cols, rows)?)
            .map_err(|_| "TERMINAL_START_FAILED")?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| "TERMINAL_START_FAILED")?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| "TERMINAL_START_FAILED")?;
        let mut command = shell_command(&app, &launch.arguments)?;
        if let Some(originator) = launch.originator {
            command.env("CODEX_INTERNAL_ORIGINATOR_OVERRIDE", originator);
        }
        command.cwd(root);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| "TERMINAL_START_FAILED")?;
        if launch.record_opencode_fallback {
            if let Err(error) = launch.conversation.save_opencode_fallback() {
                let _ = child.clone_killer().kill();
                let _ = child.wait();
                return Err(error);
            }
        }
        drop(pair.slave);
        let current = Arc::new(Session {
            id: session_id,
            vault_id,
            notes_directory: directory,
            forget_epoch: state.forget_epoch.load(Ordering::SeqCst),
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            killer: Mutex::new(child.clone_killer()),
            stopped: AtomicBool::new(false),
            child_exited: AtomicBool::new(false),
            flow: Mutex::new(Flow::default()),
            wake: Condvar::new(),
        });
        {
            let mut slot = state.session.lock().map_err(|_| "TERMINAL_FAILED")?;
            if state.revision.load(Ordering::SeqCst) != revision
                || crate::app::runtime::notes_dir(&app)? != current.notes_directory
            {
                current.stop();
                let _ = child.wait();
                return Err("TERMINAL_CLOSED".into());
            }
            *slot = Some(current.clone());
        }
        let (exit_send, exit_receive) = std::sync::mpsc::channel();
        let reaped = current.clone();
        let capture_app = app.clone();
        let lifecycle_output = output.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|status| status.exit_code());
            reaped.child_exited.store(true, Ordering::SeqCst);
            let interrupted = reaped.stopped.load(Ordering::SeqCst);
            let state = capture_app.state::<TerminalState>();
            if launch
                .conversation
                .capture_if_current(reaped.forget_epoch, &state.forget_epoch)
                .is_err()
            {
                let _ = lifecycle_output.send(TerminalEvent::Error);
            }
            if !interrupted {
                let _ = lifecycle_output.send(TerminalEvent::CliExit { code });
            }
            let _ = exit_send.send(code);
        });
        let worker_app = app.clone();
        std::thread::spawn(move || {
            let mut buffer = [0; 8192];
            let mut failed = false;
            while !current.stopped.load(Ordering::SeqCst) {
                let flow = match current.flow.lock() {
                    Ok(flow) => flow,
                    Err(_) => break,
                };
                let waited =
                    current
                        .wake
                        .wait_timeout_while(flow, Duration::from_secs(30), |flow| {
                            flow.sent - flow.acknowledged >= OUTPUT_WINDOW
                                && !current.stopped.load(Ordering::SeqCst)
                        });
                let Ok((flow, _)) = waited else {
                    break;
                };
                if current.stopped.load(Ordering::SeqCst) {
                    break;
                }
                if flow.sent - flow.acknowledged >= OUTPUT_WINDOW {
                    failed = true;
                    break;
                }
                drop(flow);
                let count = match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => count,
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => {
                        failed = true;
                        break;
                    }
                };
                let sequence = match current.flow.lock() {
                    Ok(mut flow) => {
                        flow.sent += count as u64;
                        flow.sent
                    }
                    Err(_) => break,
                };
                if output
                    .send(TerminalEvent::Data {
                        bytes: buffer[..count].to_vec(),
                        sequence,
                    })
                    .is_err()
                {
                    failed = true;
                    break;
                }
            }
            if failed {
                let _ = output.send(TerminalEvent::Error);
            }
            let natural_code = if !failed && !current.stopped.load(Ordering::SeqCst) {
                exit_receive
                    .recv_timeout(Duration::from_secs(5))
                    .ok()
                    .flatten()
            } else {
                None
            };
            current.stop();
            let code = natural_code.or_else(|| {
                exit_receive
                    .recv_timeout(Duration::from_secs(2))
                    .ok()
                    .flatten()
            });
            let _ = output.send(TerminalEvent::Exit { code });
            let state = worker_app.state::<TerminalState>();
            if let Ok(mut slot) = state.session.lock() {
                if slot
                    .as_ref()
                    .is_some_and(|value| Arc::ptr_eq(value, &current))
                {
                    slot.take();
                }
            };
        });
        Ok(())
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}
#[tauri::command]
pub(crate) async fn terminal_write(
    app: AppHandle,
    vault_id: String,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if data.len() > 32_768 {
        return Err("TERMINAL_INPUT_TOO_LARGE".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let current = session(&app, &vault_id, &session_id)?;
        let mut writer = current.writer.lock().map_err(|_| "TERMINAL_FAILED")?;
        writer
            .as_mut()
            .ok_or("TERMINAL_CLOSED")?
            .write_all(&data)
            .map_err(|_| "TERMINAL_FAILED".to_string())
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}
#[tauri::command]
pub(crate) async fn terminal_resize(
    app: AppHandle,
    vault_id: String,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let current = session(&app, &vault_id, &session_id)?;
        let master = current.master.lock().map_err(|_| "TERMINAL_FAILED")?;
        master
            .as_ref()
            .ok_or("TERMINAL_CLOSED")?
            .resize(size(cols, rows)?)
            .map_err(|_| "TERMINAL_FAILED".to_string())
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}
#[tauri::command]
pub(crate) fn terminal_ack(
    app: AppHandle,
    vault_id: String,
    session_id: String,
    sequence: u64,
) -> Result<(), String> {
    let current = session(&app, &vault_id, &session_id)?;
    let mut flow = current.flow.lock().map_err(|_| "TERMINAL_FAILED")?;
    if sequence > flow.sent {
        return Err("TERMINAL_FAILED".into());
    }
    flow.acknowledged = flow.acknowledged.max(sequence);
    current.wake.notify_all();
    Ok(())
}
#[tauri::command]
pub(crate) async fn terminal_close(app: AppHandle, session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<TerminalState>();
        let _operation = state.operation.lock().map_err(|_| "TERMINAL_FAILED")?;
        let removed = {
            let mut slot = state.session.lock().map_err(|_| "TERMINAL_FAILED")?;
            if slot.as_ref().is_some_and(|value| value.id == session_id) {
                slot.take()
            } else {
                None
            }
        };
        if let Some(current) = removed {
            current.stop();
        }
        Ok(())
    })
    .await
    .map_err(|_| "TERMINAL_FAILED".to_string())?
}
