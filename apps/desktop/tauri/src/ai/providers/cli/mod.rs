mod open_session;

use self::open_session::{validate_opencode_session_id, OpenCodeSession};
use super::{antigravity, claude, opencode, opencode_catalog, process, protocol::Stream};
use crate::ai::{
    repository::{self, Provider},
    tools,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, ChildStdin, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};
use tauri::{AppHandle, Emitter};

struct Run {
    bridge: Option<crate::ai::link_requests::Bridge>,
    request_id: String,
    child: Option<Mutex<Child>>,
    cancelled: AtomicBool,
    timed_out: AtomicBool,
    worker: Mutex<Option<JoinHandle<()>>>,
    timer_cancel: Mutex<Option<std::sync::mpsc::Sender<()>>>,
}
impl Run {
    fn cancel(&self) {
        if let Some(bridge) = &self.bridge {
            bridge.stop();
        }
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(child) = &self.child {
            if let Ok(mut child) = child.lock() {
                process::stop(&mut child);
            }
        }
        self.stop_timer();
    }
    fn stop_timer(&self) {
        if let Ok(mut cancel) = self.timer_cancel.lock() {
            if let Some(cancel) = cancel.take() {
                let _ = cancel.send(());
            }
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

struct ActiveTurn {
    request_id: String,
    stream: Stream,
    timer_cancel: Option<std::sync::mpsc::Sender<()>>,
}

struct PersistentSession {
    provider: Provider,
    vault_id: String,
    model: Option<String>,
    effort: Option<String>,
    app: AppHandle,
    connection_id: String,
    bridge: crate::ai::link_requests::Bridge,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    active: Mutex<Option<ActiveTurn>>,
    alive: AtomicBool,
}

impl Drop for PersistentSession {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        self.bridge.stop();
        if let Ok(child) = self.child.get_mut() {
            process::stop(child);
        }
    }
}

impl PersistentSession {
    fn emit(&self, request_id: &str, mut event: Value) {
        event["connectionId"] = json!(self.connection_id);
        event["vaultId"] = json!(self.vault_id);
        event["requestId"] = json!(request_id);
        let _ = self.app.emit("ai-event", event);
    }

    fn submit(self: &Arc<Self>, request_id: &str, text: &str) -> Result<(), String> {
        self.begin_turn(request_id)?;
        self.write_turn(request_id, text)
    }

    fn begin_turn(&self, request_id: &str) -> Result<(), String> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err("AI_DISCONNECTED".into());
        }
        self.bridge.activate(
            self.vault_id.clone(),
            self.connection_id.clone(),
            request_id.into(),
            crate::ai::task::Purpose::Chat,
        )?;
        {
            let mut active = self.active.lock().map_err(|_| "AI_DISCONNECTED")?;
            if active.is_some() {
                self.bridge.deactivate(request_id);
                return Err("AI_BUSY".into());
            }
            *active = Some(ActiveTurn {
                request_id: request_id.into(),
                stream: Stream::for_model(self.model.as_deref()),
                timer_cancel: None,
            });
        }
        Ok(())
    }

    fn write_turn(self: &Arc<Self>, request_id: &str, text: &str) -> Result<(), String> {
        let input = match self.provider {
            Provider::Antigravity => json!({
                "event":"user",
                "message":{"content":text}
            }),
            Provider::Claude => json!({
                "type":"user",
                "message":{"role":"user","content":[{"type":"text","text":text}]}
            }),
            _ => {
                self.bridge.deactivate(request_id);
                if let Ok(mut active) = self.active.lock() {
                    *active = None;
                }
                return Err("AI_INVALID_PROVIDER".into());
            }
        };
        let write: Result<(), String> = (|| {
            let mut stdin = self
                .stdin
                .lock()
                .map_err(|_| "AI_DISCONNECTED".to_string())?;
            serde_json::to_writer(&mut *stdin, &input)
                .map_err(|_| "AI_PROTOCOL_ERROR".to_string())?;
            stdin
                .write_all(b"\n")
                .and_then(|_| stdin.flush())
                .map_err(|_| "AI_SEND_FAILED".to_string())
        })();
        if let Err(error) = write {
            self.finish(request_id, Some(&error), false);
            self.terminate();
            return Err(error);
        }
        let (timer_cancel, timer) = std::sync::mpsc::channel();
        if let Ok(mut active) = self.active.lock() {
            if let Some(turn) = active.as_mut().filter(|turn| turn.request_id == request_id) {
                turn.timer_cancel = Some(timer_cancel);
            }
        }
        let session = Arc::downgrade(self);
        let request = request_id.to_string();
        std::thread::spawn(move || {
            if matches!(
                timer.recv_timeout(std::time::Duration::from_secs(900)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ) {
                if let Some(session) = session.upgrade() {
                    session.finish(&request, Some("AI_TIMEOUT"), false);
                    session.terminate();
                }
            }
        });
        Ok(())
    }

    fn receive_line(&self, value: Value) -> bool {
        let mut active = match self.active.lock() {
            Ok(active) => active,
            Err(_) => return false,
        };
        let Some(turn) = active.as_mut() else {
            return false;
        };
        if let Some(event) = turn.stream.receive(self.provider, &value) {
            if let Some(blocks) = event["blocks"].as_array() {
                for event in blocks {
                    self.emit(&turn.request_id, event.clone());
                }
            } else {
                self.emit(&turn.request_id, event);
            }
        }
        turn.stream.completed
            || matches!(
                turn.stream.error_code,
                Some("AI_CLAUDE_MCP_FAILED" | "AI_ANTIGRAVITY_MCP_FAILED")
            )
    }

    fn finish(&self, request_id: &str, forced_error: Option<&str>, interrupted: bool) {
        let turn = {
            let Ok(mut active) = self.active.lock() else {
                return;
            };
            if active
                .as_ref()
                .is_none_or(|turn| turn.request_id != request_id)
            {
                return;
            }
            active.take()
        };
        let Some(mut turn) = turn else { return };
        if let Some(cancel) = turn.timer_cancel.take() {
            let _ = cancel.send(());
        }
        self.bridge.deactivate(request_id);
        let error = if interrupted {
            None
        } else {
            forced_error
                .or(turn.stream.error_code)
                .or_else(|| {
                    (turn.stream.failed && !turn.stream.answered).then_some("AI_REQUEST_FAILED")
                })
                .or_else(|| {
                    (!turn.stream.answered).then_some(match self.provider {
                        Provider::Claude => "AI_CLAUDE_EMPTY_RESPONSE",
                        Provider::Antigravity => "AI_ANTIGRAVITY_EMPTY_RESPONSE",
                        _ => "AI_REQUEST_FAILED",
                    })
                })
        };
        let failed = error.is_some() || (!interrupted && turn.stream.failed);
        self.emit(
            request_id,
            json!({
                "kind":"completed",
                "failed":failed,
                "status":if interrupted { "interrupted" } else if failed { "failed" } else { "completed" },
                "errorCode":error,
                "errorDetail":turn.stream.error_detail
            }),
        );
    }

    fn terminate(&self) {
        if self.alive.swap(false, Ordering::SeqCst) {
            self.bridge.stop();
            if let Ok(mut child) = self.child.lock() {
                process::stop(&mut child);
            }
        }
    }

    fn cancel(&self, request_id: Option<&str>) {
        let active = self
            .active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()));
        if let Some(active) = active.filter(|active| request_id.is_none_or(|id| id == active)) {
            self.finish(&active, None, true);
            self.terminate();
        }
    }
}

pub(crate) struct Client {
    pub(crate) provider: Provider,
    binary: process::Executable,
    app: AppHandle,
    connection_id: String,
    alive: AtomicBool,
    runs: Mutex<HashMap<String, Arc<Run>>>,
    sessions: Mutex<HashMap<String, Arc<PersistentSession>>>,
    open_sessions: Mutex<HashMap<String, Arc<OpenCodeSession>>>,
    authenticated: Mutex<Option<bool>>,
    pub(crate) operation: Mutex<()>,
}

impl Client {
    pub(crate) fn start(app: AppHandle, provider: Provider) -> Result<Arc<Self>, String> {
        let name = match provider {
            Provider::Claude => "claude",
            Provider::Opencode => "opencode",
            Provider::Antigravity => "agy",
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
        if provider == Provider::Antigravity && !antigravity::supported_version(&version) {
            return Err("AI_ANTIGRAVITY_VERSION_REQUIRED".into());
        }
        Ok(Arc::new(Self {
            provider,
            binary,
            app,
            connection_id: uuid::Uuid::now_v7().to_string(),
            alive: AtomicBool::new(true),
            runs: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
            open_sessions: Mutex::new(HashMap::new()),
            authenticated: Mutex::new(None),
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
            if self
                .authenticated
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .is_some_and(|authenticated| authenticated)
            {
                true
            } else {
                let mut command = process::command(&self.binary);
                command.args(["auth", "status"]);
                let (success, output) = process::output(command)?;
                let authenticated = claude::authenticated(success, &output)?;
                if authenticated {
                    *self.authenticated.lock().map_err(|_| "AI_DISCONNECTED")? = Some(true);
                }
                authenticated
            }
        } else {
            true
        };
        Ok(
            json!({"connected":true,"authenticated":authenticated,"connectionId":self.connection_id}),
        )
    }
    pub(crate) fn models(&self) -> Result<Value, String> {
        if self.provider == Provider::Antigravity {
            return antigravity::models(&self.binary);
        }
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
        if let Ok(mut authenticated) = self.authenticated.lock() {
            *authenticated = None;
        }
        let login = if self.provider == Provider::Antigravity {
            ""
        } else {
            " auth login"
        };
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
                    &format!("& '{path}'{prefix}{login}"),
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
                    .args(login.split_whitespace())
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
        purpose: crate::ai::task::Purpose,
    ) -> Result<Value, String> {
        if purpose == crate::ai::task::Purpose::Chat {
            if matches!(self.provider, Provider::Claude | Provider::Antigravity) {
                return self.send_persistent_chat(vault_id, request_id, text, model, effort);
            }
            if self.provider == Provider::Opencode {
                return self.send_persistent_opencode(vault_id, request_id, text, model);
            }
        }
        self.send_oneshot(vault_id, request_id, text, model, effort, purpose)
    }

    fn send_persistent_chat(
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
        let model_key = model.filter(|model| !model.is_empty()).map(str::to_owned);
        let effort_key = effort
            .filter(|effort| !effort.is_empty())
            .map(str::to_owned);
        let existing = self
            .sessions
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .get(vault_id)
            .cloned();
        if let Some(session) = existing {
            let busy = session
                .active
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .is_some();
            if busy {
                return Err("AI_BUSY".into());
            }
            if session.alive.load(Ordering::SeqCst)
                && session.model == model_key
                && session.effort == effort_key
            {
                session.submit(request_id, text)?;
                return Ok(json!({"threadId":request_id}));
            }
            if let Ok(mut sessions) = self.sessions.lock() {
                sessions.remove(vault_id);
            }
            session.terminate();
        }

        let root = repository::workspace(&self.app, vault_id, self.provider)?;
        let prompt = chat_prompt(&self.app, vault_id, self.provider, request_id, text)?;
        let directory = crate::app::runtime::app_directory(&self.app)?;
        let binary = std::env::current_exe().map_err(|_| "AI_START_FAILED")?;
        let bridge = crate::ai::link_requests::Bridge::start(self.app.clone())?;
        let mut mcp_args = json!(["--ai-mcp", directory, vault_id]);
        mcp_args.as_array_mut().ok_or("AI_PROTOCOL_ERROR")?.extend(
            bridge
                .arguments()
                .as_array()
                .ok_or("AI_PROTOCOL_ERROR")?
                .iter()
                .cloned(),
        );
        mcp_args
            .as_array_mut()
            .ok_or("AI_PROTOCOL_ERROR")?
            .push(json!(crate::ai::task::Purpose::Chat.name()));
        let mut command = process::command(&self.binary);
        command
            .current_dir(&root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        match self.provider {
            Provider::Claude => {
                let mcp = json!({"mcpServers":{"omega":{"command":binary,"args":mcp_args}}});
                claude::configure(
                    &mut command,
                    mcp,
                    crate::ai::task::Purpose::Chat,
                    model_key.as_deref(),
                    effort_key.as_deref(),
                    true,
                );
            }
            Provider::Antigravity => {
                let mcp = json!({"mcpServers":{"omega":{"command":binary,"args":mcp_args}}});
                antigravity::configure(
                    &mut command,
                    &root,
                    mcp,
                    crate::ai::task::Purpose::Chat,
                    model_key.as_deref(),
                )?;
            }
            _ => return Err("AI_INVALID_PROVIDER".into()),
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(_) => return Err("AI_START_FAILED".into()),
        };
        let stdin = child.stdin.take().ok_or("AI_START_FAILED")?;
        let stdout = child.stdout.take().ok_or("AI_START_FAILED")?;
        let stderr = child.stderr.take().ok_or("AI_START_FAILED")?;
        let session = Arc::new(PersistentSession {
            provider: self.provider,
            vault_id: vault_id.into(),
            model: model_key,
            effort: effort_key,
            app: self.app.clone(),
            connection_id: self.connection_id.clone(),
            bridge,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            active: Mutex::new(None),
            alive: AtomicBool::new(true),
        });
        session.begin_turn(request_id)?;
        self.sessions
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .insert(vault_id.into(), session.clone());
        self.prune_persistent_vaults(vault_id);
        let weak = Arc::downgrade(&session);
        std::thread::spawn(move || stream_reader(weak, stdout, stderr));
        if let Err(error) = session.write_turn(request_id, &prompt) {
            if let Ok(mut sessions) = self.sessions.lock() {
                sessions.remove(vault_id);
            }
            session.terminate();
            return Err(error);
        }
        Ok(json!({"threadId":request_id}))
    }

    fn send_persistent_opencode(
        self: &Arc<Self>,
        vault_id: &str,
        request_id: &str,
        text: &str,
        model: Option<&str>,
    ) -> Result<Value, String> {
        if model.is_none_or(|model| !opencode_catalog::supported_model(model)) {
            return Err("AI_OPENCODE_MODELS_UNAVAILABLE".into());
        }
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
        let root = repository::workspace(&self.app, vault_id, self.provider)?;
        let existing = self
            .open_sessions
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .get(vault_id)
            .cloned();
        let session = if let Some(session) = existing.filter(|session| session.is_alive()) {
            session
        } else {
            if let Ok(mut sessions) = self.open_sessions.lock() {
                if let Some(old) = sessions.remove(vault_id) {
                    old.stop();
                }
            }
            let session = OpenCodeSession::start(
                &self.app,
                vault_id,
                &self.connection_id,
                root,
                self.binary.clone(),
            )?;
            self.open_sessions
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .insert(vault_id.into(), session.clone());
            self.prune_persistent_vaults(vault_id);
            session
        };
        if !session.is_alive() {
            return Err("AI_DISCONNECTED".into());
        }
        session.start_events(Arc::downgrade(self))?;
        let first_turn = !session.has_conversation.load(Ordering::SeqCst);
        let prompt = if !first_turn {
            text.to_string()
        } else {
            chat_prompt(&self.app, vault_id, self.provider, request_id, text)?
        };
        let model = model.expect("validated OpenCode model");
        let model_is_go = model.starts_with("opencode-go/");
        let user_message_id = format!("msg_{}", uuid::Uuid::now_v7().simple());
        session.begin_turn(request_id, &user_message_id, model_is_go)?;
        let run = Arc::new(Run {
            bridge: None,
            request_id: request_id.into(),
            child: None,
            cancelled: AtomicBool::new(false),
            timed_out: AtomicBool::new(false),
            worker: Mutex::new(None),
            timer_cancel: Mutex::new(None),
        });
        let mut runs = self.runs.lock().map_err(|_| "AI_DISCONNECTED")?;
        if runs.contains_key(vault_id) {
            session.abort_turn(request_id);
            return Err("AI_BUSY".into());
        }
        runs.insert(vault_id.into(), run.clone());
        drop(runs);

        let (cancel_timer, timer_worker) = std::sync::mpsc::channel();
        *run.timer_cancel.lock().map_err(|_| "AI_DISCONNECTED")? = Some(cancel_timer);
        let client = Arc::downgrade(self);
        let session_for_timer = Arc::downgrade(&session);
        let request_for_timer = request_id.to_string();
        let run_for_timer = Arc::downgrade(&run);
        let timer_worker = std::thread::spawn(move || {
            if matches!(
                timer_worker.recv_timeout(std::time::Duration::from_secs(900)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ) {
                if let (Some(client), Some(session), Some(run)) = (
                    client.upgrade(),
                    session_for_timer.upgrade(),
                    run_for_timer.upgrade(),
                ) {
                    run.timed_out.store(true, Ordering::SeqCst);
                    client.finish_opencode_turn(
                        &session,
                        &request_for_timer,
                        Some("AI_TIMEOUT"),
                        false,
                    );
                    session.interrupt();
                }
            }
        });
        *run.worker.lock().map_err(|_| "AI_DISCONNECTED")? = Some(timer_worker);

        let result = (|| {
            let selected_model = session.model.lock().map_err(|_| "AI_DISCONNECTED")?.clone();
            if selected_model.as_deref() != Some(model) {
                session.select_model(model)?;
                *session.model.lock().map_err(|_| "AI_DISCONNECTED")? = Some(model.into());
            }
            let path = session.session_path("/prompt")?;
            session.api_sync(
                "POST",
                &path,
                Some(json!({"id":user_message_id,"text":prompt,"resume":true})),
                model_is_go,
            )?;
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            session.abort_turn(request_id);
            session.interrupt();
            if let Ok(mut runs) = self.runs.lock() {
                if runs
                    .get(vault_id)
                    .is_some_and(|current| Arc::ptr_eq(current, &run))
                {
                    runs.remove(vault_id);
                }
            }
            run.stop_timer();
            return Err(error);
        }
        session.has_conversation.store(true, Ordering::SeqCst);
        Ok(json!({"threadId":request_id}))
    }

    fn send_oneshot(
        self: &Arc<Self>,
        vault_id: &str,
        request_id: &str,
        text: &str,
        model: Option<&str>,
        effort: Option<&str>,
        purpose: crate::ai::task::Purpose,
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
        let root = repository::workspace_for_request(
            &self.app,
            vault_id,
            self.provider,
            purpose,
            request_id,
        )?;
        self.clean_sessions(&root)?;
        let directory = crate::app::runtime::app_directory(&self.app)?;
        let binary = std::env::current_exe().map_err(|_| "AI_START_FAILED")?;
        let bridge = crate::ai::link_requests::Bridge::start(self.app.clone())?;
        bridge.activate(
            vault_id.into(),
            self.connection_id.clone(),
            request_id.into(),
            purpose,
        )?;
        let mut mcp_args = json!(["--ai-mcp", directory, vault_id]);
        mcp_args
            .as_array_mut()
            .unwrap()
            .extend(bridge.arguments().as_array().unwrap().iter().cloned());
        mcp_args.as_array_mut().unwrap().push(json!(purpose.name()));
        let mut command = process::command(&self.binary);
        command.current_dir(&root).stdin(Stdio::piped());
        command.stderr(Stdio::piped());
        let antigravity_mcp = (self.provider == Provider::Antigravity)
            .then(|| json!({"mcpServers":{"omega":{"command":binary,"args":mcp_args}}}));
        if self.provider == Provider::Claude {
            let mcp = json!({"mcpServers":{"omega":{"command":binary,"args":mcp_args}}});
            claude::configure(&mut command, mcp, purpose, model, effort, false);
        } else if self.provider == Provider::Opencode {
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
                purpose.instructions(),
                model,
            )?;
        }
        let prompt = if purpose.is_study() {
            text.to_string()
        } else {
            chat_prompt(&self.app, vault_id, self.provider, request_id, text)?
        };
        if let Some(mcp) = antigravity_mcp {
            antigravity::configure(&mut command, &root, mcp, purpose, model)?;
        }
        let prompt = if self.provider == Provider::Antigravity {
            format!("{}\n", json!({"event":"user","message":{"content":prompt}}))
        } else {
            prompt
        };
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(_) => {
                let _ = self.clean_sessions(&root);
                return Err("AI_START_FAILED".into());
            }
        };
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
            bridge: Some(bridge),
            request_id: request_id.into(),
            child: Some(Mutex::new(child)),
            cancelled: AtomicBool::new(false),
            timed_out: AtomicBool::new(false),
            worker: Mutex::new(None),
            timer_cancel: Mutex::new(None),
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
                    if matches!(
                        stream.error_code,
                        Some("AI_CLAUDE_MCP_FAILED" | "AI_ANTIGRAVITY_MCP_FAILED")
                    ) {
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
                    .as_ref()
                    .and_then(|child| child.lock().ok())
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
            if (!success || client.provider == Provider::Antigravity)
                && stream.error_detail.is_none()
            {
                stream.error_detail = stderr_receive
                    .recv_timeout(std::time::Duration::from_millis(100))
                    .ok()
                    .filter(|message| !message.trim().is_empty());
            }
            if client.provider == Provider::Antigravity
                && stream.error_code.is_none()
                && !current.cancelled.load(Ordering::SeqCst)
                && stream.error_detail.as_deref().is_some_and(|detail| {
                    detail
                        .lines()
                        .any(|line| antigravity::error_code(line) == "AI_ANTIGRAVITY_MCP_FAILED")
                })
            {
                stream.error_code = Some("AI_ANTIGRAVITY_MCP_FAILED");
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
            if client.provider == Provider::Antigravity
                && stream.error_code.is_none()
                && !current.cancelled.load(Ordering::SeqCst)
            {
                stream.error_code = if !written {
                    Some("AI_ANTIGRAVITY_SEND_FAILED")
                } else if !success {
                    Some(antigravity::error_code(
                        stream.error_detail.as_deref().unwrap_or(""),
                    ))
                } else if !stream.completed {
                    Some("AI_PROTOCOL_ERROR")
                } else if !stream.answered {
                    Some("AI_ANTIGRAVITY_EMPTY_RESPONSE")
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
                "errorCode":error,"errorDetail":if error.is_some_and(|code| code.starts_with("AI_OPENCODE_") || code.starts_with("AI_CLAUDE_") || code.starts_with("AI_ANTIGRAVITY_")) { stream.error_detail } else { None }}));
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
    fn finish_opencode_turn(
        &self,
        session: &OpenCodeSession,
        request_id: &str,
        forced_error: Option<&str>,
        interrupted: bool,
    ) {
        let turn = session.active.lock().ok().and_then(|mut active| {
            active
                .as_ref()
                .is_some_and(|turn| turn.request_id == request_id)
                .then(|| active.take())
                .flatten()
        });
        let Some(turn) = turn else { return };
        session.bridge.deactivate(request_id);
        let error = if interrupted {
            None
        } else {
            forced_error
                .or(turn.error_code)
                .or_else(|| (!turn.answered).then_some("AI_OPENCODE_EMPTY_RESPONSE"))
        };
        let failed = error.is_some();
        self.emit(
            &session.vault_id,
            request_id,
            json!({
                "kind":"completed",
                "failed":failed,
                "status":if interrupted { "interrupted" } else if failed { "failed" } else { "completed" },
                "errorCode":error,
                "errorDetail":if error.is_some_and(|code| code.starts_with("AI_OPENCODE_")) { turn.error_detail } else { None }
            }),
        );
        if let Ok(mut runs) = self.runs.lock() {
            let run = runs
                .get(&session.vault_id)
                .filter(|run| run.request_id == request_id)
                .cloned();
            if run.is_some() {
                runs.remove(&session.vault_id);
            }
            drop(runs);
            if let Some(run) = run {
                run.stop_timer();
            }
        }
    }
    fn prune_persistent_vaults(&self, keep: &str) {
        const MAX_IDLE_VAULT_SESSIONS: usize = 2;
        if self.provider == Provider::Opencode {
            loop {
                let removed = {
                    let Ok(mut sessions) = self.open_sessions.lock() else {
                        return;
                    };
                    if sessions.len() <= MAX_IDLE_VAULT_SESSIONS {
                        return;
                    }
                    let busy = self.runs.lock().ok();
                    let candidate = sessions
                        .keys()
                        .find(|vault| {
                            vault.as_str() != keep
                                && !busy.as_ref().is_some_and(|runs| runs.contains_key(*vault))
                        })
                        .cloned();
                    candidate.and_then(|vault| sessions.remove(&vault))
                };
                let Some(removed) = removed else { return };
                removed.stop();
            }
        }
        loop {
            let removed = {
                let Ok(mut sessions) = self.sessions.lock() else {
                    return;
                };
                if sessions.len() <= MAX_IDLE_VAULT_SESSIONS {
                    return;
                }
                let candidate = sessions
                    .iter()
                    .find(|(vault, session)| {
                        vault.as_str() != keep
                            && session.active.lock().is_ok_and(|active| active.is_none())
                    })
                    .map(|(vault, _)| vault.clone());
                candidate.and_then(|vault| sessions.remove(&vault))
            };
            let Some(removed) = removed else { return };
            removed.terminate();
        }
    }
    pub(crate) fn cancel(
        &self,
        vault_id: &str,
        clear: bool,
        request_id: Option<&str>,
    ) -> Result<(), String> {
        let run = self
            .runs
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .get(vault_id)
            .cloned();
        let matched_run = run.filter(|run| request_id.is_none_or(|id| id == run.request_id));
        let cancelled_run = matched_run.is_some();
        if let Some(run) = matched_run {
            if self.provider == Provider::Opencode {
                if let Some(session) = self
                    .open_sessions
                    .lock()
                    .ok()
                    .and_then(|sessions| sessions.get(vault_id).cloned())
                {
                    self.finish_opencode_turn(&session, &run.request_id, None, true);
                    session.interrupt();
                }
            }
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
        let session = self
            .sessions
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .get(vault_id)
            .cloned();
        if let Some(session) = session {
            let active_request = session
                .active
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .as_ref()
                .map(|turn| turn.request_id.clone());
            if active_request
                .as_deref()
                .is_some_and(|active| request_id.is_none_or(|requested| requested == active))
            {
                session.cancel(request_id);
                if let Ok(mut sessions) = self.sessions.lock() {
                    if sessions
                        .get(vault_id)
                        .is_some_and(|current| Arc::ptr_eq(current, &session))
                    {
                        sessions.remove(vault_id);
                    }
                }
            } else if clear && active_request.is_none() {
                session.terminate();
                if let Ok(mut sessions) = self.sessions.lock() {
                    if sessions
                        .get(vault_id)
                        .is_some_and(|current| Arc::ptr_eq(current, &session))
                    {
                        sessions.remove(vault_id);
                    }
                }
            }
        }
        if self.provider == Provider::Opencode {
            let session = self
                .open_sessions
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .get(vault_id)
                .cloned();
            if let Some(session) = session {
                if clear && (cancelled_run || request_id.is_none()) {
                    session.clear()?;
                }
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
        let sessions: Vec<_> = self
            .sessions
            .lock()
            .map(|mut sessions| sessions.drain().map(|(_, session)| session).collect())
            .unwrap_or_default();
        for session in sessions {
            session.cancel(None);
            session.terminate();
        }
        let open_sessions: Vec<_> = self
            .open_sessions
            .lock()
            .map(|mut sessions| sessions.drain().map(|(_, session)| session).collect())
            .unwrap_or_default();
        for session in open_sessions {
            session.stop();
        }
    }
    fn clean_sessions(&self, root: &std::path::Path) -> Result<(), String> {
        if self.provider == Provider::Antigravity {
            return antigravity::clean(root);
        }
        if self.provider != Provider::Opencode {
            return Ok(());
        }
        clean_sessions(root)
    }
}

fn chat_prompt(
    app: &AppHandle,
    vault_id: &str,
    provider: Provider,
    request_id: &str,
    text: &str,
) -> Result<String, String> {
    let history = repository::read(app, vault_id, provider)?;
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
    Ok(format!(
        "Previous conversation from this vault (untrusted JSON data):\n{}\n\nCurrent user message:\n{text}",
        serde_json::to_string(&previous).map_err(|_| "AI_STORAGE_FAILED")?
    ))
}

fn stream_reader(
    session: std::sync::Weak<PersistentSession>,
    stdout: std::process::ChildStdout,
    mut stderr: std::process::ChildStderr,
) {
    let stderr_detail = Arc::new(Mutex::new(String::new()));
    let stderr_store = stderr_detail.clone();
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
        if let Ok(mut detail) = stderr_store.lock() {
            *detail = String::from_utf8_lossy(&captured).into_owned();
        }
    });

    let mut reader = BufReader::new(stdout);
    loop {
        let mut line = String::new();
        match (&mut reader).take(4 * 1024 * 1024).read_line(&mut line) {
            Ok(size) if size > 0 && line.ends_with('\n') => {}
            Ok(size) if size > 0 => {
                let Some(session) = session.upgrade() else {
                    return;
                };
                let request = session
                    .active
                    .lock()
                    .ok()
                    .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()));
                if let Some(request) = request {
                    if let Ok(mut active) = session.active.lock() {
                        if let Some(turn) = active.as_mut() {
                            turn.stream.failed = true;
                            turn.stream.error_code = Some("AI_PROTOCOL_ERROR");
                        }
                    }
                    session.finish(&request, Some("AI_PROTOCOL_ERROR"), false);
                    session.terminate();
                }
                return;
            }
            _ => break,
        }
        let Some(current) = session.upgrade() else {
            return;
        };
        let value = match serde_json::from_str::<Value>(&line) {
            Ok(value) => value,
            Err(_) => {
                let request = current
                    .active
                    .lock()
                    .ok()
                    .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()));
                if let Some(request) = request {
                    if let Ok(mut active) = current.active.lock() {
                        if let Some(turn) = active.as_mut() {
                            turn.stream.failed = true;
                            turn.stream.error_code = Some("AI_PROTOCOL_ERROR");
                        }
                    }
                    current.finish(&request, Some("AI_PROTOCOL_ERROR"), false);
                    current.terminate();
                    return;
                }
                continue;
            }
        };
        if current.receive_line(value) {
            let (request, stop_after_turn) = current
                .active
                .lock()
                .ok()
                .and_then(|active| {
                    active.as_ref().map(|turn| {
                        (
                            turn.request_id.clone(),
                            matches!(
                                turn.stream.error_code,
                                Some("AI_CLAUDE_MCP_FAILED" | "AI_ANTIGRAVITY_MCP_FAILED")
                            ),
                        )
                    })
                })
                .unwrap_or_default();
            if !request.is_empty() {
                current.finish(&request, None, false);
            }
            if stop_after_turn {
                current.terminate();
                return;
            }
        }
    }

    if let Some(current) = session.upgrade() {
        let detail = stderr_detail
            .lock()
            .ok()
            .map(|detail| detail.clone())
            .filter(|detail| !detail.trim().is_empty());
        let request = current
            .active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()));
        if let Some(request) = request {
            if let (Some(detail), Ok(mut active)) = (detail.as_ref(), current.active.lock()) {
                if let Some(turn) = active.as_mut() {
                    turn.stream.error_detail = Some(detail.chars().take(2000).collect());
                }
            }
            let code = if current.provider == Provider::Antigravity {
                antigravity::error_code(detail.as_deref().unwrap_or(""))
            } else {
                "AI_CLAUDE_CLI_FAILED"
            };
            current.finish(&request, Some(code), false);
        }
        current.terminate();
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
    if !validate_opencode_session_id(&id) {
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
