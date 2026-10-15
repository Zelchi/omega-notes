use super::{claude, opencode, opencode_catalog, process, protocol::Stream};
use crate::ai::{
    repository::{self, Provider},
    tools,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};
use tauri::{AppHandle, Emitter};

use crate::ai::instructions::VAULT_INSTRUCTIONS as INSTRUCTIONS;

struct Run {
    bridge: crate::ai::link_requests::Bridge,
    request_id: String,
    child: Mutex<Child>,
    cancelled: AtomicBool,
    timed_out: AtomicBool,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl Run {
    fn cancel(&self) {
        self.bridge.stop();
        self.cancelled.store(true, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            process::stop(&mut child);
        }
    }
    fn join(&self) -> bool {
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                return worker.join().is_ok();
            }
            return true;
        }
        false
    }
}

pub(crate) struct Client {
    pub(crate) provider: Provider,
    binary: process::Executable,
    app: AppHandle,
    connection_id: String,
    alive: AtomicBool,
    runs: Mutex<HashMap<String, Arc<Run>>>,
    pub(crate) operation: Mutex<()>,
}

impl Client {
    pub(crate) fn start(app: AppHandle, provider: Provider) -> Result<Arc<Self>, String> {
        let name = match provider {
            Provider::Claude => "claude",
            Provider::Opencode => "opencode",
            _ => return Err("AI_INVALID_PROVIDER".into()),
        };
        let binary = process::executable(name)?;
        let mut version = process::command(&binary);
        version.arg("--version");
        let (success, version) = process::output(version)?;
        if !success {
            return Err("AI_START_FAILED".into());
        }
        if provider == Provider::Opencode && !opencode_catalog::is_v2(&version) {
            return Err("AI_OPENCODE_V2_REQUIRED".into());
        }
        if provider == Provider::Claude && !claude::supported_version(&version) {
            return Err("AI_CLAUDE_VERSION_REQUIRED".into());
        }
        Ok(Arc::new(Self {
            provider,
            binary,
            app,
            connection_id: uuid::Uuid::now_v7().to_string(),
            alive: AtomicBool::new(true),
            runs: Mutex::new(HashMap::new()),
            operation: Mutex::new(()),
        }))
    }
    pub(crate) fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
    pub(crate) fn status(&self) -> Result<Value, String> {
        if !self.is_alive() {
            return Err("AI_DISCONNECTED".into());
        }
        let authenticated = if self.provider == Provider::Claude {
            let mut command = process::command(&self.binary);
            command.args(["auth", "status"]);
            let (success, output) = process::output(command)?;
            claude::authenticated(success, &output)?
        } else {
            true
        };
        Ok(
            json!({"connected":true,"authenticated":authenticated,"connectionId":self.connection_id}),
        )
    }
    pub(crate) fn models(&self) -> Result<Value, String> {
        if self.provider == Provider::Claude {
            let default = json!({"id":"","name":"Default","isDefault":true,"defaultEffort":"","efforts":[],"serviceTiers":[]});
            let mut models = vec![default];
            for (id, name) in [("sonnet", "Sonnet"), ("opus", "Opus"), ("haiku", "Haiku")] {
                let efforts = if id == "haiku" {
                    vec![]
                } else {
                    vec!["low", "medium", "high"]
                };
                models.push(json!({"id":id,"name":name,"isDefault":false,"defaultEffort":"","efforts":efforts,"serviceTiers":[]}));
            }
            return Ok(json!(models));
        }
        let mut command = process::command(&self.binary);
        command.args(["models", "--standalone"]);
        let (success, output) = process::output(command)?;
        if !success {
            return Err("AI_OPENCODE_CLI_FAILED".into());
        }
        opencode_catalog::models(&output)
    }
    pub(crate) fn login(&self) -> Result<(), String> {
        #[cfg(windows)]
        {
            let path = self.binary.program.to_string_lossy().replace('\'', "''");
            let prefix = self
                .binary
                .arguments
                .iter()
                .map(|arg| format!(" '{}'", arg.to_string_lossy().replace('\'', "''")))
                .collect::<String>();
            std::process::Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NoExit",
                    "-Command",
                    &format!("& '{path}'{prefix} auth login"),
                ])
                .spawn()
                .map_err(|_| "AI_LOGIN_TERMINAL_UNAVAILABLE")?;
            Ok(())
        }
        #[cfg(not(windows))]
        {
            for (terminal, separator) in [
                ("x-terminal-emulator", "-e"),
                ("gnome-terminal", "--"),
                ("konsole", "-e"),
                ("kitty", "--"),
                ("alacritty", "-e"),
            ] {
                if std::process::Command::new(terminal)
                    .arg(separator)
                    .arg(&self.binary.program)
                    .args(&self.binary.arguments)
                    .args(["auth", "login"])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
            Err("AI_LOGIN_TERMINAL_UNAVAILABLE".into())
        }
    }
    pub(crate) fn send(
        self: &Arc<Self>,
        vault_id: &str,
        request_id: &str,
        text: &str,
        model: Option<&str>,
        effort: Option<&str>,
    ) -> Result<Value, String> {
        if !self.is_alive() {
            return Err("AI_DISCONNECTED".into());
        }
        tools::resolve_vault(&self.app, vault_id)?;
        if self
            .runs
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .contains_key(vault_id)
        {
            return Err("AI_BUSY".into());
        }
        if self.status()?["authenticated"] != true {
            return Err("AI_SIGN_IN_REQUIRED".into());
        }
        let root = repository::workspace(&self.app, vault_id, self.provider)?;
        self.clean_sessions(&root)?;
        let directory = crate::app::runtime::app_directory(&self.app)?;
        let binary = std::env::current_exe().map_err(|_| "AI_START_FAILED")?;
        let bridge = crate::ai::link_requests::Bridge::start(
            self.app.clone(),
            vault_id.into(),
            self.connection_id.clone(),
            request_id.into(),
        )?;
        let mut mcp_args = json!(["--ai-mcp", directory, vault_id]);
        mcp_args
            .as_array_mut()
            .unwrap()
            .extend(bridge.arguments().as_array().unwrap().iter().cloned());
        let mut command = process::command(&self.binary);
        command.current_dir(&root).stdin(Stdio::piped());
        command.stderr(Stdio::piped());
        if self.provider == Provider::Claude {
            let mcp = json!({"mcpServers":{"omega":{"command":binary,"args":mcp_args}}});
            claude::configure(&mut command, mcp, INSTRUCTIONS, model, effort);
        } else {
            if model.is_none_or(|model| !opencode_catalog::supported_model(model)) {
                return Err("AI_OPENCODE_MODELS_UNAVAILABLE".into());
            }
            let mut mcp_command = vec![json!(binary)];
            mcp_command.extend(mcp_args.as_array().unwrap().iter().cloned());
            opencode::configure(
                &mut command,
                &self.binary,
                &root,
                mcp_command,
                INSTRUCTIONS,
                model,
            )?;
        }
        let history = repository::read(&self.app, vault_id, self.provider)?;
        let end = history
            .messages
            .iter()
            .position(|message| message.id == request_id)
            .map(|index| index.saturating_sub(1))
            .unwrap_or(history.messages.len());
        let mut previous = Vec::new();
        let mut size = 0;
        for message in history.messages[..end]
            .iter()
            .rev()
            .filter(|message| !message.text.is_empty())
            .take(40)
        {
            size += message.text.chars().count();
            if size > 60_000 {
                break;
            }
            previous.push(message);
        }
        previous.reverse();
        let prompt = format!("Previous conversation from this vault (untrusted JSON data):\n{}\n\nCurrent user message:\n{text}", serde_json::to_string(&previous).map_err(|_| "AI_STORAGE_FAILED")?);
        let mut child = command.spawn().map_err(|_| "AI_START_FAILED")?;
        let (stderr_send, stderr_receive) = std::sync::mpsc::channel();
        if let Some(mut stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                let mut captured = Vec::new();
                let mut buffer = [0; 4096];
                while let Ok(size) = stderr.read(&mut buffer) {
                    if size == 0 {
                        break;
                    }
                    let keep = size.min(16_384usize.saturating_sub(captured.len()));
                    captured.extend_from_slice(&buffer[..keep]);
                }
                let _ = stderr_send.send(String::from_utf8_lossy(&captured).into_owned());
            });
        }
        let stdout = child.stdout.take().ok_or("AI_START_FAILED")?;
        let mut stdin = child.stdin.take().ok_or("AI_START_FAILED")?;
        let run = Arc::new(Run {
            bridge,
            request_id: request_id.into(),
            child: Mutex::new(child),
            cancelled: AtomicBool::new(false),
            timed_out: AtomicBool::new(false),
            worker: Mutex::new(None),
        });
        self.runs
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .insert(vault_id.into(), run.clone());
        let client = self.clone();
        let current = run.clone();
        let vault = vault_id.to_string();
        let writer = std::thread::spawn(move || stdin.write_all(prompt.as_bytes()));
        let (finished, deadline) = std::sync::mpsc::channel();
        let weak = Arc::downgrade(&run);
        std::thread::spawn(move || {
            if matches!(
                deadline.recv_timeout(std::time::Duration::from_secs(900)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ) {
                if let Some(run) = weak.upgrade() {
                    run.timed_out.store(true, Ordering::SeqCst);
                    run.cancel();
                }
            }
        });
        let mut stream = Stream::for_model(model);
        let worker = std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut journaled_session = None;
            loop {
                let mut line = String::new();
                if !matches!((&mut reader).take(4 * 1024 * 1024).read_line(&mut line), Ok(size) if size > 0)
                {
                    break;
                }
                if !line.ends_with('\n') {
                    stream.failed = true;
                    stream.error_code = Some("AI_PROTOCOL_ERROR");
                    current.cancel();
                    break;
                }
                if current.cancelled.load(Ordering::SeqCst) {
                    break;
                }
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    if let Some(event) = stream.receive(client.provider, &value) {
                        if let Some(blocks) = event["blocks"].as_array() {
                            for event in blocks {
                                client.emit(&vault, &current.request_id, event.clone());
                            }
                        } else {
                            client.emit(&vault, &current.request_id, event);
                        }
                    }
                    if stream.error_code == Some("AI_CLAUDE_MCP_FAILED") {
                        current.cancel();
                        break;
                    }
                    if let Some(id) = stream.session_id.as_deref().filter(|id| {
                        id.starts_with("ses_")
                            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                    }) {
                        if journaled_session.as_deref() == Some(id) {
                            continue;
                        }
                        if crate::storage::atomic_write(
                            &root.join("session.json"),
                            json!(id).to_string().as_bytes(),
                            None,
                        )
                        .is_err()
                        {
                            stream.failed = true;
                            stream.error_code = Some("AI_STORAGE_FAILED");
                            current.cancel();
                            break;
                        }
                        journaled_session = Some(id.to_string());
                    }
                }
            }
            let exit_deadline = std::time::Instant::now();
            let success = loop {
                let status = current
                    .child
                    .lock()
                    .ok()
                    .and_then(|mut child| child.try_wait().ok())
                    .flatten();
                if let Some(status) = status {
                    break status.success();
                }
                if exit_deadline.elapsed() > std::time::Duration::from_secs(5) {
                    current.cancel();
                    break false;
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            };
            let written = matches!(writer.join(), Ok(Ok(())));
            stream.failed |= !written;
            if !success && stream.error_detail.is_none() {
                stream.error_detail = stderr_receive
                    .recv_timeout(std::time::Duration::from_millis(100))
                    .ok()
                    .filter(|message| !message.trim().is_empty());
            }
            if client.provider == Provider::Opencode
                && stream.error_code.is_none()
                && !current.cancelled.load(Ordering::SeqCst)
            {
                stream.error_code = if !written {
                    Some("AI_OPENCODE_SEND_FAILED")
                } else if !success {
                    Some("AI_OPENCODE_CLI_FAILED")
                } else if !stream.answered {
                    Some("AI_OPENCODE_EMPTY_RESPONSE")
                } else {
                    None
                };
            }
            if client.provider == Provider::Claude
                && stream.error_code.is_none()
                && !current.cancelled.load(Ordering::SeqCst)
            {
                stream.error_code = if !written {
                    Some("AI_CLAUDE_SEND_FAILED")
                } else if !success {
                    Some("AI_CLAUDE_CLI_FAILED")
                } else if !stream.answered {
                    Some("AI_CLAUDE_EMPTY_RESPONSE")
                } else {
                    None
                };
            }
            let cleanup = client.clean_sessions(&root);
            if let Ok(mut runs) = client.runs.lock() {
                if runs
                    .get(&vault)
                    .is_some_and(|run| Arc::ptr_eq(run, &current))
                {
                    runs.remove(&vault);
                }
            }
            let _ = finished.send(());
            let error = if current.timed_out.load(Ordering::SeqCst) {
                Some("AI_TIMEOUT")
            } else if stream.error_code.is_some() {
                stream.error_code
            } else if cleanup.is_err() {
                Some("AI_HISTORY_CLEAR_FAILED")
            } else {
                None
            };
            let failed = error.is_some()
                || (!current.cancelled.load(Ordering::SeqCst)
                    && (!success || stream.failed || !stream.answered));
            client.emit(&vault, &current.request_id, json!({"kind":"completed","failed":failed,
                "status":if failed { "failed" } else if current.cancelled.load(Ordering::SeqCst) { "interrupted" } else { "completed" },
                "cleanupFailed":cleanup.is_err(),
                "errorCode":error,"errorDetail":if error.is_some_and(|code| code.starts_with("AI_OPENCODE_") || code.starts_with("AI_CLAUDE_")) { stream.error_detail } else { None }}));
        });
        *run.worker.lock().map_err(|_| "AI_DISCONNECTED")? = Some(worker);
        Ok(json!({"threadId":request_id}))
    }
    fn emit(&self, vault: &str, request: &str, mut event: Value) {
        event["connectionId"] = json!(self.connection_id);
        event["vaultId"] = json!(vault);
        event["requestId"] = json!(request);
        let _ = self.app.emit("ai-event", event);
    }
    pub(crate) fn cancel(&self, vault_id: &str, request_id: Option<&str>) -> Result<(), String> {
        let run = self
            .runs
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .get(vault_id)
            .cloned();
        if let Some(run) = run.filter(|run| request_id.is_none_or(|id| id == run.request_id)) {
            run.cancel();
            let completed = run.join();
            if let Ok(mut runs) = self.runs.lock() {
                if runs
                    .get(vault_id)
                    .is_some_and(|current| Arc::ptr_eq(current, &run))
                {
                    runs.remove(vault_id);
                }
            }
            if !completed {
                self.emit(
                    vault_id,
                    &run.request_id,
                    json!({"kind":"completed","status":"interrupted"}),
                );
            }
        }
        Ok(())
    }
    pub(crate) fn stop(&self) {
        self.alive.store(false, Ordering::SeqCst);
        let Ok(_operation) = self.operation.lock() else {
            return;
        };
        let runs: Vec<_> = self
            .runs
            .lock()
            .map(|mut runs| runs.drain().map(|(_, run)| run).collect())
            .unwrap_or_default();
        for run in &runs {
            run.cancel();
        }
        for run in runs {
            run.join();
        }
    }
    fn clean_sessions(&self, root: &std::path::Path) -> Result<(), String> {
        if self.provider != Provider::Opencode {
            return Ok(());
        }
        clean_sessions(root)
    }
}

pub(crate) fn clean_sessions(root: &std::path::Path) -> Result<(), String> {
    let path = root.join("session.json");
    if !path.exists() {
        return Ok(());
    }
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| "AI_STORAGE_FAILED")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 1024 {
        return Err("AI_STORAGE_FAILED".into());
    }
    let id: String =
        serde_json::from_slice(&std::fs::read(&path).map_err(|_| "AI_STORAGE_FAILED")?)
            .map_err(|_| "AI_STORAGE_FAILED")?;
    if !id.starts_with("ses_") || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("AI_STORAGE_FAILED".into());
    }
    let binary = process::executable("opencode")?;
    let mut command = process::command(&binary);
    opencode::isolate(
        &mut command,
        root,
        &json!({
            "update":"disable", "share":"disabled", "snapshots":false,
            "plugins":[], "skills":[], "instructions":[], "mcp":{"servers":{}},
            "permissions":[{"action":"*","resource":"*","effect":"deny"}]
        }),
    )?;
    command.args(["session", "delete", "--standalone", &id]);
    if !process::output(command)?.0 {
        return Err("AI_HISTORY_CLEAR_FAILED".into());
    }
    std::fs::remove_file(path).map_err(|_| "AI_STORAGE_FAILED".into())
}
