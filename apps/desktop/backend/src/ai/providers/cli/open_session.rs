use super::Client;
use crate::ai::providers::{opencode, opencode_error, process};
use crate::runtime::AppContext;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    process::{Child, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};

pub(super) struct OpenCodeSession {
    app: AppContext,
    pub(super) vault_id: String,
    connection_id: String,
    root: std::path::PathBuf,
    url: String,
    username: String,
    password: String,
    http: reqwest::Client,
    pub(super) bridge: crate::ai::link_requests::Bridge,
    child: Mutex<Child>,
    session_id: Mutex<String>,
    pub(super) model: Mutex<Option<String>>,
    pub(super) has_conversation: AtomicBool,
    alive: AtomicBool,
    pub(super) active: Mutex<Option<OpenCodeTurn>>,
    event_worker: Mutex<Option<JoinHandle<()>>>,
}

pub(super) struct OpenCodeTurn {
    pub(super) request_id: String,
    user_message_id: String,
    model_is_go: bool,
    pub(super) answered: bool,
    pub(super) error_code: Option<&'static str>,
    pub(super) error_detail: Option<String>,
    assistant_messages: HashSet<String>,
    parts: HashMap<String, OpenCodePart>,
}

struct OpenCodePart {
    message_id: String,
    kind: Option<String>,
    pending: String,
    emitted: String,
    snapshot: Option<String>,
}

impl Drop for OpenCodeSession {
    fn drop(&mut self) {
        self.stop();
    }
}

impl OpenCodeSession {
    pub(super) fn start(
        app: &AppContext,
        vault_id: &str,
        connection_id: &str,
        root: std::path::PathBuf,
        binary: process::Executable,
    ) -> Result<Arc<Self>, String> {
        let app_directory = crate::app::runtime::app_directory(app)?;
        let executable = std::env::current_exe().map_err(|_| "AI_START_FAILED")?;
        let bridge = crate::ai::link_requests::Bridge::start(app.clone())?;
        let mut mcp_args = json!(["--ai-mcp", app_directory, vault_id]);
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
        let mut mcp_command = vec![json!(executable)];
        mcp_command.extend(
            mcp_args
                .as_array()
                .ok_or("AI_PROTOCOL_ERROR")?
                .iter()
                .cloned(),
        );
        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "AI_START_FAILED")?;
        let port = listener.local_addr().map_err(|_| "AI_START_FAILED")?.port();
        drop(listener);
        let username = "omega-notes".to_string();
        let password = format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
        let mut command = process::command(&binary);
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .env("OPENCODE_SERVER_USERNAME", &username)
            .env("OPENCODE_SERVER_PASSWORD", &password);
        let instructions = crate::ai::task::Purpose::Chat.instructions();
        opencode::configure_server(
            &mut command,
            &binary,
            &root,
            mcp_command,
            &instructions,
            port,
        )?;
        let child = command.spawn().map_err(|_| "AI_START_FAILED")?;
        let _ = rustls::crypto::ring::default_provider().install_default();
        let http = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(std::time::Duration::from_secs(4))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .map_err(|_| "AI_START_FAILED")?;
        let session = Arc::new(Self {
            app: app.clone(),
            vault_id: vault_id.into(),
            connection_id: connection_id.into(),
            root,
            url: format!("http://127.0.0.1:{port}"),
            username,
            password,
            http,
            bridge,
            child: Mutex::new(child),
            session_id: Mutex::new(String::new()),
            model: Mutex::new(None),
            has_conversation: AtomicBool::new(false),
            alive: AtomicBool::new(true),
            active: Mutex::new(None),
            event_worker: Mutex::new(None),
        });
        let started = std::time::Instant::now();
        loop {
            if !session.is_alive() {
                return Err("AI_START_FAILED".into());
            }
            if session.api_sync("GET", "/api/info", None, false).is_ok() {
                break;
            }
            if started.elapsed() > std::time::Duration::from_secs(20) {
                session.stop();
                return Err("AI_START_FAILED".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let saved = read_opencode_session(&session.root)?;
        let existing = saved.filter(|id| validate_opencode_session_id(id));
        let session_id = if let Some(id) = existing.as_deref() {
            if session
                .api_sync("GET", &format!("/api/session/{id}"), None, false)
                .is_ok()
            {
                session.has_conversation.store(true, Ordering::SeqCst);
                id.to_string()
            } else {
                create_opencode_session(&session)?
            }
        } else {
            create_opencode_session(&session)?
        };
        crate::storage::atomic_write(
            &session.root.join("session.json"),
            json!(session_id).to_string().as_bytes(),
            None,
        )?;
        *session.session_id.lock().map_err(|_| "AI_STORAGE_FAILED")? = session_id;
        Ok(session)
    }

    pub(super) fn api_sync(
        &self,
        method: &str,
        path: &str,
        data: Option<Value>,
        model_is_go: bool,
    ) -> Result<Value, String> {
        crate::runtime::block_on(self.api(method, path, data, model_is_go))
    }

    async fn api(
        &self,
        method: &str,
        path: &str,
        data: Option<Value>,
        model_is_go: bool,
    ) -> Result<Value, String> {
        let method =
            reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "AI_PROTOCOL_ERROR")?;
        let mut request = self
            .http
            .request(method, format!("{}{}", self.url, path))
            .basic_auth(&self.username, Some(&self.password))
            .timeout(std::time::Duration::from_secs(30));
        if let Some(data) = data {
            request = request.json(&data);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "AI_OPENCODE_CONNECTION_FAILED")?;
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "AI_OPENCODE_CONNECTION_FAILED")?;
        if !status.is_success() {
            let mut detail = serde_json::from_slice::<Value>(&bytes).unwrap_or_else(|_| {
                json!({"message":String::from_utf8_lossy(&bytes).chars().take(2000).collect::<String>()})
            });
            detail["status"] = json!(status.as_u16());
            return Err(opencode_error::classify(&detail, model_is_go).into());
        }
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes).map_err(|_| "AI_PROTOCOL_ERROR".into())
    }

    pub(super) fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
            && self
                .child
                .lock()
                .ok()
                .is_some_and(|mut child| matches!(child.try_wait(), Ok(None)))
    }

    pub(super) fn clear(&self) -> Result<(), String> {
        let session_id = self
            .session_id
            .lock()
            .map_err(|_| "AI_STORAGE_FAILED")?
            .clone();
        let path = format!("/api/session/{session_id}");
        self.api_sync("DELETE", &path, None, false)
            .map_err(|_| "AI_HISTORY_CLEAR_FAILED")?;
        let path = self.root.join("session.json");
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("AI_STORAGE_FAILED".into()),
        }
        let fresh_session_id = create_opencode_session(self)?;
        crate::storage::atomic_write(
            &self.root.join("session.json"),
            json!(fresh_session_id).to_string().as_bytes(),
            None,
        )?;
        *self.session_id.lock().map_err(|_| "AI_STORAGE_FAILED")? = fresh_session_id;
        self.has_conversation.store(false, Ordering::SeqCst);
        *self.model.lock().map_err(|_| "AI_STORAGE_FAILED")? = None;
        Ok(())
    }

    pub(super) fn stop(&self) {
        if self.alive.swap(false, Ordering::SeqCst) {
            self.bridge.stop();
            if let Ok(mut child) = self.child.lock() {
                process::stop(&mut child);
            }
        }
        let worker = self
            .event_worker
            .lock()
            .ok()
            .and_then(|mut worker| worker.take());
        if let Some(worker) = worker {
            if worker.thread().id() != std::thread::current().id() {
                let _ = worker.join();
            }
        }
    }

    fn emit(&self, request_id: &str, event: Value) {
        let mut event = event;
        event["connectionId"] = json!(self.connection_id);
        event["vaultId"] = json!(self.vault_id);
        event["requestId"] = json!(request_id);
        let _ = self.app.emit("ai-event", event);
    }

    pub(super) fn begin_turn(
        &self,
        request_id: &str,
        user_message_id: &str,
        model_is_go: bool,
    ) -> Result<(), String> {
        self.bridge.activate(
            self.vault_id.clone(),
            self.connection_id.clone(),
            request_id.into(),
            crate::ai::task::Purpose::Chat,
        )?;
        let mut active = self.active.lock().map_err(|_| "AI_DISCONNECTED")?;
        if active.is_some() {
            self.bridge.deactivate(request_id);
            return Err("AI_BUSY".into());
        }
        *active = Some(OpenCodeTurn {
            request_id: request_id.into(),
            user_message_id: user_message_id.into(),
            model_is_go,
            answered: false,
            error_code: None,
            error_detail: None,
            assistant_messages: HashSet::new(),
            parts: HashMap::new(),
        });
        Ok(())
    }

    pub(super) fn abort_turn(&self, request_id: &str) {
        let turn = self.active.lock().ok().and_then(|mut active| {
            active
                .as_ref()
                .is_some_and(|turn| turn.request_id == request_id)
                .then(|| active.take())
                .flatten()
        });
        if turn.is_some() {
            self.bridge.deactivate(request_id);
        }
    }

    fn active_request(&self) -> Option<String> {
        self.active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()))
    }

    fn receive_event(&self, value: Value) -> Option<(String, Option<&'static str>)> {
        let (kind, properties) = opencode_event(&value);
        let event_session = properties["sessionID"]
            .as_str()
            .or_else(|| properties["info"]["sessionID"].as_str())
            .or_else(|| properties["part"]["sessionID"].as_str());
        let session_id = self.session_id.lock().ok()?.clone();
        if event_session != Some(session_id.as_str()) {
            return None;
        }
        let mut deltas = Vec::<(String, String, String)>::new();
        let mut completed = None;
        {
            let mut active = self.active.lock().ok()?;
            let turn = active.as_mut()?;
            match kind {
                "message.updated" | "session.message.updated" => {
                    let info = properties.get("info").unwrap_or(properties);
                    let role = info["role"].as_str().or_else(|| info["type"].as_str());
                    let message_id = info["id"].as_str()?;
                    if message_id == turn.user_message_id || role != Some("assistant") {
                        return None;
                    }
                    turn.assistant_messages.insert(message_id.into());
                    for (part_id, part) in turn
                        .parts
                        .iter_mut()
                        .filter(|(_, part)| part.message_id == message_id)
                    {
                        let pending = if let Some(snapshot) = part.snapshot.take() {
                            let delta = snapshot
                                .strip_prefix(&part.emitted)
                                .map(str::to_owned)
                                .or_else(|| part.emitted.is_empty().then(|| snapshot.clone()))
                                .unwrap_or_default();
                            part.pending.clear();
                            delta
                        } else {
                            std::mem::take(&mut part.pending)
                        };
                        if !pending.is_empty() {
                            part.emitted.push_str(&pending);
                            turn.answered = true;
                            deltas.push((turn.request_id.clone(), part_id.clone(), pending));
                        }
                    }
                }
                "message.part.updated" | "session.message.part.updated" => {
                    let part = properties.get("part")?;
                    let message_id = part["messageID"].as_str()?;
                    if message_id == turn.user_message_id {
                        return None;
                    }
                    let part_id = part["id"].as_str()?;
                    let current =
                        turn.parts
                            .entry(part_id.into())
                            .or_insert_with(|| OpenCodePart {
                                message_id: message_id.into(),
                                kind: None,
                                pending: String::new(),
                                emitted: String::new(),
                                snapshot: None,
                            });
                    current.message_id = message_id.into();
                    current.kind = part["type"].as_str().map(str::to_owned);
                    current.snapshot = part["text"].as_str().map(str::to_owned);
                    if turn.assistant_messages.contains(message_id)
                        && current.kind.as_deref().is_none_or(|kind| kind == "text")
                    {
                        if let Some(snapshot) = current.snapshot.take() {
                            let delta = snapshot
                                .strip_prefix(&current.emitted)
                                .map(str::to_owned)
                                .or_else(|| current.emitted.is_empty().then(|| snapshot.clone()))
                                .unwrap_or_default();
                            current.pending.clear();
                            if !delta.is_empty() {
                                current.emitted = snapshot;
                                turn.answered = true;
                                deltas.push((turn.request_id.clone(), part_id.into(), delta));
                            }
                        }
                    }
                }
                "message.part.delta" | "session.message.part.delta" => {
                    if properties["field"].as_str() != Some("text") {
                        return None;
                    }
                    let message_id = properties["messageID"].as_str()?;
                    let part_id = properties["partID"].as_str()?;
                    if message_id == turn.user_message_id {
                        return None;
                    }
                    let delta = properties["delta"]
                        .as_str()
                        .filter(|delta| !delta.is_empty())?;
                    let current =
                        turn.parts
                            .entry(part_id.into())
                            .or_insert_with(|| OpenCodePart {
                                message_id: message_id.into(),
                                kind: Some("text".into()),
                                pending: String::new(),
                                emitted: String::new(),
                                snapshot: None,
                            });
                    current.message_id = message_id.into();
                    if turn.assistant_messages.contains(message_id)
                        && current.kind.as_deref().is_none_or(|kind| kind == "text")
                    {
                        current.kind = Some("text".into());
                        current.emitted.push_str(delta);
                        turn.answered = true;
                        deltas.push((turn.request_id.clone(), part_id.into(), delta.into()));
                    } else if current.kind.as_deref().is_none_or(|kind| kind == "text") {
                        current.pending.push_str(delta);
                    }
                }
                "session.idle" => completed = Some((turn.request_id.clone(), None)),
                "session.error" => {
                    let error = properties.get("error").unwrap_or(properties);
                    let code = opencode_error::classify(error, turn.model_is_go);
                    turn.error_code = Some(code);
                    turn.error_detail = error["message"]
                        .as_str()
                        .or_else(|| error["error"].as_str())
                        .map(str::to_owned);
                    completed = Some((turn.request_id.clone(), Some(code)));
                }
                _ => {}
            }
        }
        for (request_id, part_id, text) in deltas {
            self.emit(
                &request_id,
                json!({"kind":"delta","itemId":part_id,"text":text}),
            );
        }
        completed
    }

    pub(super) fn start_events(
        self: &Arc<Self>,
        client: std::sync::Weak<Client>,
    ) -> Result<(), String> {
        if self
            .event_worker
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .as_ref()
            .is_some_and(|worker| !worker.is_finished())
        {
            return Ok(());
        }
        let (ready_send, ready_receive) = std::sync::mpsc::channel();
        let session = Arc::downgrade(self);
        let worker = std::thread::Builder::new()
            .name("omega-opencode-events".into())
            .spawn(move || opencode_event_worker(session, client, Some(ready_send)))
            .map_err(|_| "AI_START_FAILED")?;
        match ready_receive.recv_timeout(std::time::Duration::from_secs(12)) {
            Ok(Ok(())) => {
                *self.event_worker.lock().map_err(|_| "AI_DISCONNECTED")? = Some(worker);
                Ok(())
            }
            Ok(Err(error)) => {
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                self.stop();
                let _ = worker.join();
                Err("AI_OPENCODE_CONNECTION_FAILED".into())
            }
        }
    }

    pub(super) fn session_path(&self, suffix: &str) -> Result<String, String> {
        let id = self
            .session_id
            .lock()
            .map_err(|_| "AI_STORAGE_FAILED")?
            .clone();
        Ok(format!("/api/session/{id}{suffix}"))
    }

    pub(super) fn select_model(&self, model: &str) -> Result<(), String> {
        let (provider, id) = model.split_once('/').ok_or("AI_PROTOCOL_ERROR")?;
        let path = self.session_path("/model")?;
        self.api_sync(
            "POST",
            &path,
            Some(json!({"model":{"providerID":provider,"id":id}})),
            provider == "opencode-go",
        )?;
        Ok(())
    }

    pub(super) fn interrupt(&self) {
        if let Ok(path) = self.session_path("/interrupt") {
            let _ = self.api_sync("POST", &path, None, false);
        }
    }
}

pub(super) fn validate_opencode_session_id(id: &str) -> bool {
    id.starts_with("ses_")
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn read_opencode_session(root: &std::path::Path) -> Result<Option<String>, String> {
    let path = root.join("session.json");
    match std::fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() <= 1024 => {}
        _ => return Err("AI_STORAGE_FAILED".into()),
    }
    let id: String = serde_json::from_slice(&std::fs::read(path).map_err(|_| "AI_STORAGE_FAILED")?)
        .map_err(|_| "AI_STORAGE_FAILED")?;
    if !validate_opencode_session_id(&id) {
        return Err("AI_STORAGE_FAILED".into());
    }
    Ok(Some(id))
}

fn create_opencode_session(session: &OpenCodeSession) -> Result<String, String> {
    let response = session.api_sync(
        "POST",
        "/api/session",
        Some(json!({
            "title":"Ômega Notes",
            "agent":"omega",
            "location":{"directory":session.root}
        })),
        false,
    )?;
    let id = response["data"]["id"]
        .as_str()
        .or_else(|| response["id"].as_str())
        .filter(|id| validate_opencode_session_id(id))
        .ok_or("AI_PROTOCOL_ERROR")?;
    Ok(id.to_string())
}

fn opencode_event_worker(
    session: std::sync::Weak<OpenCodeSession>,
    client: std::sync::Weak<Client>,
    mut ready: Option<std::sync::mpsc::Sender<Result<(), String>>>,
) {
    loop {
        let Some(session) = session.upgrade() else {
            if let Some(ready) = ready.take() {
                let _ = ready.send(Err("AI_DISCONNECTED".into()));
            }
            return;
        };
        if !session.is_alive() {
            if let Some(ready) = ready.take() {
                let _ = ready.send(Err("AI_DISCONNECTED".into()));
            }
            return;
        }
        let response = crate::runtime::block_on(async {
            let response = session
                .http
                .get(format!("{}/api/event", session.url))
                .basic_auth(&session.username, Some(&session.password))
                .header(reqwest::header::ACCEPT, "text/event-stream")
                .send()
                .await
                .map_err(|_| "AI_OPENCODE_CONNECTION_FAILED")?;
            if !response.status().is_success() {
                let status = response.status();
                let bytes = response
                    .bytes()
                    .await
                    .map_err(|_| "AI_OPENCODE_CONNECTION_FAILED")?;
                let mut detail = serde_json::from_slice::<Value>(&bytes)
                    .unwrap_or_else(|_| json!({"message":String::from_utf8_lossy(&bytes)}));
                detail["status"] = json!(status.as_u16());
                return Err(opencode_error::classify(&detail, false));
            }
            Ok(response)
        });
        let response = match response {
            Ok(response) => {
                if let Some(ready) = ready.take() {
                    let _ = ready.send(Ok(()));
                }
                response
            }
            Err(error) => {
                if let Some(ready) = ready.take() {
                    let _ = ready.send(Err(error.into()));
                    return;
                }
                if let Some(request_id) = session.active_request() {
                    session.interrupt();
                    if let Some(client) = client.upgrade() {
                        client.finish_opencode_turn(&session, &request_id, Some(error), false);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
                continue;
            }
        };
        let result = crate::runtime::block_on(read_opencode_events(
            session.clone(),
            client.clone(),
            response,
        ));
        if !session.is_alive() {
            return;
        }
        if result.is_err() {
            if let Some(request_id) = session.active_request() {
                session.interrupt();
                if let Some(client) = client.upgrade() {
                    client.finish_opencode_turn(
                        &session,
                        &request_id,
                        Some("AI_OPENCODE_CONNECTION_FAILED"),
                        false,
                    );
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
    }
}

async fn read_opencode_events(
    session: Arc<OpenCodeSession>,
    client: std::sync::Weak<Client>,
    mut response: reqwest::Response,
) -> Result<(), String> {
    const MAX_SSE_LINE: usize = 4 * 1024 * 1024;
    let mut line = Vec::new();
    let mut data = Vec::<String>::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "AI_OPENCODE_CONNECTION_FAILED")?
    {
        for byte in chunk {
            if byte != b'\n' {
                line.push(byte);
                if line.len() > MAX_SSE_LINE {
                    return Err("AI_PROTOCOL_ERROR".into());
                }
                continue;
            }
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let value = String::from_utf8_lossy(&line).into_owned();
            line.clear();
            if value.is_empty() {
                if !data.is_empty() {
                    let payload = data.join("\n");
                    data.clear();
                    if let Ok(event) = serde_json::from_str::<Value>(&payload) {
                        if let Some((request_id, error)) = session.receive_event(event) {
                            if let Some(client) = client.upgrade() {
                                client.finish_opencode_turn(&session, &request_id, error, false);
                            }
                        }
                    }
                }
            } else if let Some(value) = value.strip_prefix("data:") {
                let value = value.strip_prefix(' ').unwrap_or(value);
                data.push(value.to_string());
                if data.iter().map(String::len).sum::<usize>() > MAX_SSE_LINE {
                    return Err("AI_PROTOCOL_ERROR".into());
                }
            }
        }
    }
    Err("AI_OPENCODE_CONNECTION_FAILED".into())
}

fn opencode_event(value: &Value) -> (&str, &Value) {
    let mut event = value;
    if let Some(payload) = event.get("payload").filter(|value| value.is_object()) {
        event = payload;
    }
    if let Some(nested) = event.get("event").filter(|value| value.is_object()) {
        event = nested;
    }
    let kind = event["type"].as_str().unwrap_or("");
    let properties = event
        .get("properties")
        .or_else(|| event.get("data"))
        .unwrap_or(event);
    (kind, properties)
}
