use super::super::{antigravity, claude, opencode, opencode_catalog, process, protocol::Stream};
use super::chat_prompt::chat_prompt;
use super::run::Run;
use super::Client;
use crate::ai::{
    repository::{self, Provider},
    tools,
};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::Stdio,
    sync::{atomic::Ordering, Arc},
};

impl Client {
    pub(super) fn send_oneshot(
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
            let instructions = purpose.instructions();
            opencode::configure(
                &mut command,
                &self.binary,
                &root,
                mcp_command,
                &instructions,
                purpose,
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
        let run = Arc::new(Run::new(request_id, Some(bridge), Some(child)));
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
}
