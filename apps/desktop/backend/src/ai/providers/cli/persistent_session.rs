use super::super::{antigravity, claude, process};
use super::persistent_turn::{self, completion_event, ActiveTurn};
use super::stream_framing::{read_frame, Frame};
use crate::ai::repository::{self, Provider};
use crate::runtime::AppContext;
use serde_json::{json, Value};
use std::{
    io::{BufReader, Read, Write},
    process::{Child, ChildStdin},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub(super) struct PersistentSession {
    pub(super) provider: Provider,
    pub(super) vault_id: String,
    pub(super) model: Option<String>,
    pub(super) effort: Option<String>,
    pub(super) app: AppContext,
    pub(super) connection_id: String,
    pub(super) bridge: crate::ai::link_requests::Bridge,
    pub(super) child: Mutex<Child>,
    pub(super) stdin: Mutex<ChildStdin>,
    pub(super) active: Mutex<Option<ActiveTurn>>,
    pub(super) alive: AtomicBool,
    pub(super) lifecycle: Mutex<()>,
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

    pub(super) fn submit(self: &Arc<Self>, request_id: &str, text: &str) -> Result<(), String> {
        self.begin_turn(request_id)?;
        self.write_turn(request_id, text)
    }

    pub(super) fn begin_turn(&self, request_id: &str) -> Result<(), String> {
        let _lifecycle = self.lifecycle.lock().map_err(|_| "AI_DISCONNECTED")?;
        if !self.alive.load(Ordering::SeqCst) {
            return Err("AI_DISCONNECTED".into());
        }
        self.bridge.activate(
            self.vault_id.clone(),
            self.connection_id.clone(),
            request_id.into(),
            crate::ai::task::Purpose::Chat,
        )?;
        if let Err(error) = persistent_turn::begin(&self.active, request_id, self.model.as_deref())
        {
            if error == "AI_BUSY" {
                self.bridge.deactivate(request_id);
            }
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn write_turn(self: &Arc<Self>, request_id: &str, text: &str) -> Result<(), String> {
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
            self.finish_and_terminate(request_id, Some(&error));
            return Err(error);
        }
        let (timer_cancel, timer) = std::sync::mpsc::channel();
        persistent_turn::attach_timer(&self.active, request_id, timer_cancel);
        let session = Arc::downgrade(self);
        let request = request_id.to_string();
        std::thread::spawn(move || {
            if matches!(
                timer.recv_timeout(std::time::Duration::from_secs(900)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ) {
                if let Some(session) = session.upgrade() {
                    session.finish_and_terminate(&request, Some("AI_TIMEOUT"));
                }
            }
        });
        Ok(())
    }

    pub(super) fn receive_line(&self, value: Value) -> bool {
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

    pub(super) fn finish(
        &self,
        request_id: &str,
        forced_error: Option<&str>,
        interrupted: bool,
    ) -> bool {
        let Some(turn) = persistent_turn::take_matching(&self.active, request_id) else {
            return false;
        };
        self.bridge.deactivate(request_id);
        self.emit(
            request_id,
            completion_event(self.provider, &turn.stream, forced_error, interrupted),
        );
        true
    }

    pub(super) fn terminate(&self) {
        if self.alive.swap(false, Ordering::SeqCst) {
            self.bridge.stop();
            if let Ok(mut child) = self.child.lock() {
                process::stop(&mut child);
            }
        }
    }

    pub(super) fn finish_and_terminate(&self, request_id: &str, error: Option<&str>) -> bool {
        self.finish_and_terminate_with_hook(request_id, error, || {})
    }

    pub(super) fn finish_and_terminate_with_hook(
        &self,
        request_id: &str,
        error: Option<&str>,
        after_finish: impl FnOnce(),
    ) -> bool {
        let Ok(_lifecycle) = self.lifecycle.lock() else {
            return false;
        };
        if !self.finish(request_id, error, false) {
            return false;
        }
        after_finish();
        self.terminate();
        true
    }

    pub(super) fn fail_current_protocol(&self) -> bool {
        self.fail_current_protocol_with_hook(|| {})
    }

    pub(super) fn fail_current_protocol_with_hook(&self, after_finish: impl FnOnce()) -> bool {
        let Ok(_lifecycle) = self.lifecycle.lock() else {
            return false;
        };
        let Some(request) = persistent_turn::matching_request(&self.active, None) else {
            return false;
        };
        if !self.finish(&request, Some("AI_PROTOCOL_ERROR"), false) {
            return false;
        }
        after_finish();
        self.terminate();
        true
    }

    pub(super) fn cancel(&self, request_id: Option<&str>) -> bool {
        self.cancel_with_hook(request_id, || {})
    }

    pub(super) fn cancel_with_hook(
        &self,
        request_id: Option<&str>,
        after_match: impl FnOnce(),
    ) -> bool {
        let Ok(_lifecycle) = self.lifecycle.lock() else {
            return false;
        };
        if let Some(active) = persistent_turn::matching_request(&self.active, request_id) {
            after_match();
            self.finish(&active, None, true);
            self.terminate();
            return true;
        }
        false
    }
}

pub(super) fn stream_reader(
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
        let value = match read_frame(&mut reader) {
            Frame::Event(value) => value,
            Frame::Unterminated => {
                let Some(session) = session.upgrade() else {
                    return;
                };
                session.fail_current_protocol();
                return;
            }
            Frame::InvalidJson => {
                let Some(current) = session.upgrade() else {
                    return;
                };
                if current.fail_current_protocol() {
                    return;
                }
                continue;
            }
            Frame::End => break,
        };
        let Some(current) = session.upgrade() else {
            return;
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
            if stop_after_turn {
                if !request.is_empty() && current.finish_and_terminate(&request, None) {
                    return;
                }
                continue;
            }
            if !request.is_empty() {
                current.finish(&request, None, false);
            }
        }
    }

    if let Some(current) = session.upgrade() {
        let Ok(_lifecycle) = current.lifecycle.lock() else {
            return;
        };
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

use super::chat_prompt::chat_prompt;
use super::Client;
use crate::ai::tools;
use std::process::Stdio;

impl Client {
    pub(super) fn send_persistent_chat(
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
            lifecycle: Mutex::new(()),
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
}
