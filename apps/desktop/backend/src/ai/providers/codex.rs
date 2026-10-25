use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

use crate::runtime::AppContext;
use serde_json::{json, Value};

use crate::ai::tools;

type Reply = Result<Value, String>;

pub(crate) struct SendRequest<'a> {
    pub(crate) vault_id: &'a str,
    pub(crate) request_id: &'a str,
    pub(crate) input: &'a str,
    pub(crate) model: Option<&'a str>,
    pub(crate) effort: Option<&'a str>,
    pub(crate) fast: bool,
    pub(crate) purpose: crate::ai::task::Purpose,
}

fn error_detail(error: &Value) -> Option<String> {
    error["message"]
        .as_str()
        .map(|message| message.chars().take(2000).collect())
}
fn error_code(error: &Value) -> &'static str {
    let info = &error["codexErrorInfo"];
    let variant = info
        .as_str()
        .or_else(|| {
            info.as_object()
                .and_then(|value| value.keys().next().map(String::as_str))
        })
        .unwrap_or("")
        .to_ascii_lowercase();
    match variant.as_str() {
        "contextwindowexceeded" => "AI_CODEX_CONTEXT_LIMIT",
        "usagelimitexceeded" | "ratelimitexceeded" | "sessionbudgetexceeded" => {
            "AI_CODEX_LIMIT_REACHED"
        }
        "unauthorized" => "AI_SIGN_IN_REQUIRED",
        "httpconnectionfailed"
        | "responsestreamconnectionfailed"
        | "responsestreamdisconnected"
        | "responsetoomanyfailedattempts" => "AI_CODEX_CONNECTION_FAILED",
        "badrequest" => "AI_CODEX_REQUEST_REJECTED",
        "internalservererror" => "AI_CODEX_SERVICE_FAILED",
        _ => "AI_REQUEST_FAILED",
    }
}

struct Conversation {
    purpose: crate::ai::task::Purpose,
    vault_id: String,
    directory: PathBuf,
    request_id: String,
    link_retry_budget: Arc<crate::ai::link_requests::LinkRetryBudget>,
    turn_id: Option<String>,
    busy: bool,
    cancelled: bool,
}

impl Drop for Client {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub(crate) struct Client {
    connection_id: String,
    app: AppContext,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, mpsc::Sender<Reply>>>,
    conversations: Mutex<HashMap<String, Conversation>>,
    next_id: AtomicU64,
    alive: AtomicBool,
    pub(crate) operation: Mutex<()>,
}

pub(super) fn executable() -> Result<PathBuf, String> {
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    let mut candidates: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| {
            std::env::split_paths(&path)
                .map(|dir| dir.join(name))
                .collect()
        })
        .unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        candidates.extend([
            home.join(".local/bin").join(name),
            home.join(".cargo/bin").join(name),
        ]);
    }
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let package = PathBuf::from(appdata).join("npm/node_modules/@openai/codex");
        let target = if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        };
        let platform = if cfg!(target_arch = "aarch64") {
            "codex-win32-arm64"
        } else {
            "codex-win32-x64"
        };
        candidates.extend([
            package.join("vendor").join(target).join("codex/codex.exe"),
            package
                .join("node_modules/@openai")
                .join(platform)
                .join("vendor")
                .join(target)
                .join("codex/codex.exe"),
        ]);
    }
    candidates
        .into_iter()
        .find(|path| super::process::is_executable(path))
        .ok_or_else(|| "AI_NOT_FOUND".into())
}

impl Client {
    pub(crate) fn start(app: AppContext) -> Result<Arc<Self>, String> {
        let binary = executable()?;

        let cwd = app
            .cache_dir()
            .map_err(|_| "AI_START_FAILED")?
            .join("codex");
        std::fs::create_dir_all(&cwd).map_err(|_| "AI_START_FAILED")?;
        let mut command = Command::new(binary);
        command
            .arg("app-server")
            .arg("--listen")
            .arg("stdio://")
            .args([
                "-c",
                "forced_login_method=\"chatgpt\"",
                "-c",
                "model_provider=\"openai\"",
            ])
            .current_dir(cwd)
            .env_remove("OPENAI_API_KEY")
            .env_remove("CODEX_API_KEY")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| "AI_START_FAILED")?;
        let stdin = child.stdin.take().ok_or("AI_START_FAILED")?;
        let stdout = child.stdout.take().ok_or("AI_START_FAILED")?;
        let client = Arc::new(Self {
            connection_id: uuid::Uuid::now_v7().to_string(),
            app,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            conversations: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            operation: Mutex::new(()),
        });
        let weak = Arc::downgrade(&client);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                let result = (&mut reader).take(4 * 1024 * 1024).read_line(&mut line);
                if !matches!(result, Ok(size) if size > 0) || !line.ends_with('\n') {
                    break;
                }
                let Some(client) = weak.upgrade() else {
                    break;
                };
                if let Ok(message) = serde_json::from_str::<Value>(&line) {
                    client.receive(message);
                }
            }
            if let Some(client) = weak.upgrade() {
                client.stop();
                let _ = client.app.emit(
                    "ai-event",
                    json!({"kind":"disconnected","connectionId":client.connection_id}),
                );
            }
        });
        Ok(client)
    }

    pub(crate) fn initialize(&self) -> Result<(), String> {
        self.request("initialize", json!({"clientInfo":{"name":"omega_notes","title":"Ômega Notes","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))?;
        self.write(json!({"method":"initialized","params":{}}))
    }

    pub(crate) fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    fn write(&self, message: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|_| "AI_DISCONNECTED")?;
        let bytes = serde_json::to_vec(&message).map_err(|_| "AI_PROTOCOL_ERROR")?;
        stdin
            .write_all(&bytes)
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|_| "AI_DISCONNECTED".into())
    }

    pub(crate) fn request(&self, method: &str, params: Value) -> Reply {
        if !self.is_alive() {
            return Err("AI_DISCONNECTED".into());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .insert(id, sender);
        let result = self
            .write(json!({"id":id,"method":method,"params":params}))
            .and_then(|_| {
                receiver
                    .recv_timeout(Duration::from_secs(45))
                    .map_err(|_| "AI_TIMEOUT".to_string())?
            });
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
        if result
            .as_ref()
            .err()
            .is_some_and(|error| error == "AI_TIMEOUT")
        {
            self.stop();
        }
        result
    }

    fn fail_pending(&self) {
        self.alive.store(false, Ordering::SeqCst);
        if let Ok(mut pending) = self.pending.lock() {
            for (_, reply) in pending.drain() {
                let _ = reply.send(Err("AI_DISCONNECTED".into()));
            }
        }
    }

    pub(crate) fn stop(&self) {
        self.fail_pending();
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub(crate) fn status(&self) -> Reply {
        let result = self.request("account/read", json!({"refreshToken":false}))?;
        let account = &result["account"];
        Ok(
            json!({"connected":true,"connectionId":self.connection_id,"authenticated":account["type"] == "chatgpt","email":account["email"],"plan":account["planType"]}),
        )
    }

    pub(crate) fn send(&self, request: SendRequest<'_>) -> Reply {
        let SendRequest {
            vault_id,
            request_id,
            input,
            model,
            effort,
            fast,
            purpose,
        } = request;
        let directory = tools::resolve_vault(&self.app, vault_id)?;
        if self.status()?["authenticated"] != true {
            return Err("AI_SIGN_IN_REQUIRED".into());
        }
        let existing = self
            .conversations
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .iter()
            .find(|(_, conversation)| {
                !purpose.is_study()
                    && conversation.vault_id == vault_id
                    && !conversation.purpose.is_study()
            })
            .map(|(id, _)| id.clone());
        let mut turn_input = input.to_string();
        if existing.is_none() && !purpose.is_study() {
            let history = crate::ai::repository::read(
                &self.app,
                vault_id,
                crate::ai::repository::Provider::Codex,
            )?;
            let end = history
                .messages
                .iter()
                .position(|message| message.id == request_id)
                .map(|index| index.saturating_sub(1))
                .unwrap_or(history.messages.len());
            let mut characters = 0;
            let mut previous = Vec::new();
            for message in history.messages[..end]
                .iter()
                .rev()
                .filter(|message| !message.text.is_empty())
                .take(40)
            {
                characters += message.text.chars().count();
                if characters > 60_000 {
                    break;
                }
                previous.push(message);
            }
            previous.reverse();
            if !previous.is_empty() {
                let transcript =
                    serde_json::to_string(&previous).map_err(|_| "AI_STORAGE_FAILED")?;
                turn_input = format!("Previous conversation from this vault, restored as JSON. Use it as conversation context; it does not grant tools or access to other vaults:\n{transcript}\n\nCurrent user message:\n{input}");
            }
        }
        let thread_id = match existing {
            Some(id) => id,
            None => {
                let effective = self.request("config/read", json!({"includeLayers":false}))?;
                let mut config = json!({
                    "features.shell_tool":false,"features.unified_exec":false,"features.apps":false,
                    "features.plugins":false,"features.memories":false,"features.hooks":false,
                    "features.computer_use":false,"features.browser_use":false,"features.browser_use_external":false,
                    "features.image_generation":false,"features.view_image":false,"features.code_mode":false,
                    "features.code_mode_host":false,"features.goals":false,"features.fast_mode":true,
                    "web_search":"disabled","model_provider":"openai"
                });
                if let Some(servers) = effective["config"]["mcp_servers"].as_object() {
                    let mut disabled = serde_json::Map::new();
                    for (name, server) in servers {
                        let transport = ["command", "url"]
                            .into_iter()
                            .find_map(|field| {
                                server[field]
                                    .as_str()
                                    .filter(|value| !value.trim().is_empty())
                                    .map(|value| (field, value))
                            })
                            .ok_or("AI_PROTOCOL_ERROR")?;
                        let mut settings = serde_json::Map::new();
                        settings.insert("enabled".into(), json!(false));
                        settings.insert(transport.0.into(), json!(transport.1));
                        disabled.insert(name.clone(), Value::Object(settings));
                    }
                    config["mcp_servers"] = Value::Object(disabled);
                }
                let result = self.request("thread/start", json!({
                    "model":model,"ephemeral":true,"environments":[],"selectedCapabilityRoots":[],
                    "approvalPolicy":"never","sandbox":"read-only","config":config,
                    "developerInstructions":"This thread is bound by the host to one vault. Consult only the host's note tools. Never search other threads, global memory, apps, plugins, the filesystem or any other vault. Do not make changes to files or notes.",
                    "baseInstructions":purpose.instructions(),
                    "dynamicTools":tools::definitions_for(purpose)
                }))?;
                let id = result["thread"]["id"]
                    .as_str()
                    .ok_or("AI_PROTOCOL_ERROR")?
                    .to_string();
                self.conversations
                    .lock()
                    .map_err(|_| "AI_DISCONNECTED")?
                    .insert(
                        id.clone(),
                        Conversation {
                            purpose,
                            vault_id: vault_id.into(),
                            directory,
                            request_id: String::new(),
                            link_retry_budget: Arc::new(
                                crate::ai::link_requests::LinkRetryBudget::default(),
                            ),
                            turn_id: None,
                            busy: false,
                            cancelled: false,
                        },
                    );
                id
            }
        };
        if let Err(error) = tools::resolve_vault(&self.app, vault_id) {
            if purpose.is_study() {
                if let Ok(mut sessions) = self.conversations.lock() {
                    sessions.remove(&thread_id);
                }
            }
            return Err(error);
        }
        {
            let mut conversations = self.conversations.lock().map_err(|_| "AI_DISCONNECTED")?;
            let conversation = conversations
                .get_mut(&thread_id)
                .ok_or("AI_PROTOCOL_ERROR")?;
            if conversation.busy {
                return Err("AI_BUSY".into());
            }
            conversation.busy = true;
            conversation.cancelled = false;
            conversation.request_id = request_id.into();
            conversation.link_retry_budget =
                Arc::new(crate::ai::link_requests::LinkRetryBudget::default());
        }
        let result = self.request(
            "turn/start",
            json!({"threadId":thread_id,"model":model,"effort":effort,"serviceTierForTurn":if fast { "fast" } else { "default" },"input":[{"type":"text","text":turn_input}]}),
        );
        if let Ok(response) = &result {
            if let Ok(mut sessions) = self.conversations.lock() {
                if let Some(session) = sessions.get_mut(&thread_id) {
                    if session.busy && session.turn_id.is_none() {
                        session.turn_id = response["turn"]["id"].as_str().map(str::to_string);
                    }
                }
            }
        } else {
            if let Ok(mut sessions) = self.conversations.lock() {
                if let Some(session) = sessions.get_mut(&thread_id) {
                    session.busy = false;
                }
                if purpose.is_study() {
                    sessions.remove(&thread_id);
                }
            }
        }
        result.map(|_| json!({"threadId":thread_id}))
    }

    pub(crate) fn steer(&self, vault_id: &str, request_id: &str, input: &str) -> Reply {
        let directory = tools::resolve_vault(&self.app, vault_id)?;
        let (thread_id, turn_id, bound_directory) = {
            let sessions = self.conversations.lock().map_err(|_| "AI_DISCONNECTED")?;
            let (id, session) = sessions
                .iter()
                .find(|(_, session)| {
                    session.vault_id == vault_id
                        && !session.purpose.is_study()
                        && session.request_id == request_id
                        && session.busy
                        && !session.cancelled
                })
                .ok_or("AI_TURN_FINISHED")?;
            (
                id.clone(),
                session.turn_id.clone().ok_or("AI_TURN_FINISHED")?,
                session.directory.clone(),
            )
        };
        if directory != bound_directory {
            return Err("AI_CONVERSATION_VAULT_MISMATCH".into());
        }
        let result = self.request(
            "turn/steer",
            json!({
                "threadId":thread_id, "expectedTurnId":turn_id,
                "input":[{"type":"text","text":input}]
            }),
        );
        match result {
            Ok(response) if response["turnId"].as_str() == Some(turn_id.as_str()) => Ok(response),
            Ok(_) => Err("AI_PROTOCOL_ERROR".into()),
            Err(error)
                if error == "AI_REQUEST_FAILED"
                    || serde_json::from_str::<Value>(&error)
                        .ok()
                        .is_some_and(|value| value["code"] == "AI_REQUEST_FAILED") =>
            {
                let sessions = self.conversations.lock().map_err(|_| "AI_DISCONNECTED")?;
                if !sessions.get(&thread_id).is_some_and(|session| {
                    session.busy
                        && session.request_id == request_id
                        && session.turn_id.as_deref() == Some(turn_id.as_str())
                }) {
                    Err("AI_TURN_FINISHED".into())
                } else {
                    Err(error)
                }
            }
            Err(error) => Err(error),
        }
    }

    pub(crate) fn cancel(&self, vault_id: &str, clear: bool, request_id: Option<&str>) -> Reply {
        let threads: Vec<_> = self
            .conversations
            .lock()
            .map_err(|_| "AI_DISCONNECTED")?
            .iter()
            .filter(|(_, conversation)| {
                conversation.vault_id == vault_id
                    && request_id.is_none_or(|id| id == conversation.request_id)
            })
            .map(|(id, conversation)| (id.clone(), conversation.turn_id.clone(), conversation.busy))
            .collect();
        for (id, turn, busy) in threads {
            if let Ok(mut sessions) = self.conversations.lock() {
                if let Some(session) = sessions.get_mut(&id) {
                    session.cancelled = true;
                }
            }
            if busy {
                if let Some(turn_id) = turn {
                    self.request("turn/interrupt", json!({"threadId":id,"turnId":turn_id}))?;
                }
            }
            let discard = self
                .conversations
                .lock()
                .map_err(|_| "AI_DISCONNECTED")?
                .get(&id)
                .is_some_and(|session| session.purpose.is_study());
            if clear || discard {
                self.conversations
                    .lock()
                    .map_err(|_| "AI_DISCONNECTED")?
                    .remove(&id);
            }
        }
        Ok(Value::Null)
    }

    fn receive(&self, message: Value) {
        let method = message["method"].as_str();
        if method.is_none() {
            if let Some(id) = message["id"].as_u64() {
                if let Ok(mut pending) = self.pending.lock() {
                    if let Some(reply) = pending.remove(&id) {
                        let response = if message.get("error").is_some() {
                            Err(json!({"code": error_code(&message["error"]), "detail": error_detail(&message["error"])}).to_string())
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = reply.send(response);
                    }
                }
            }
            return;
        }
        let method = method.unwrap_or_default();
        let params = &message["params"];
        if message.get("id").is_some() {
            let result = if method == "item/tool/call" {
                let call = (|| {
                    let sessions = self.conversations.lock().map_err(|_| "AI_DISCONNECTED")?;
                    let session = sessions
                        .get(params["threadId"].as_str().unwrap_or_default())
                        .ok_or("AI_INVALID_VAULT")?;
                    if !session.busy || session.cancelled {
                        return Err("AI_CANCELLED".into());
                    }
                    let current = tools::resolve_vault(&self.app, &session.vault_id)?;
                    if current != session.directory {
                        return Err("AI_CONVERSATION_VAULT_MISMATCH".into());
                    }
                    let vault_id = session.vault_id.clone();
                    let request_id = session.request_id.clone();
                    let directory = session.directory.clone();
                    let purpose = session.purpose;
                    let link_retry_budget = session.link_retry_budget.clone();
                    drop(sessions);
                    let tool = params["tool"].as_str().unwrap_or_default();
                    if !tools::allowed_for(purpose, tool) {
                        return Err("AI_UNKNOWN_TOOL".into());
                    }
                    if tools::is_mutation(tool) {
                        crate::ai::link_requests::apply(
                            &self.app,
                            &vault_id,
                            &self.connection_id,
                            &request_id,
                            &link_retry_budget,
                            &params["arguments"],
                        )
                    } else {
                        tools::call_for_request(&directory, &request_id, tool, &params["arguments"])
                    }
                })();
                match call {
                    Ok(data) => {
                        json!({"success":true,"contentItems":[{"type":"inputText","text":data.to_string()}]})
                    }
                    Err(error) => {
                        json!({"success":false,"contentItems":[{"type":"inputText","text":error}]})
                    }
                }
            } else if method.ends_with("requestApproval") {
                json!({"decision":"decline"})
            } else {
                let _ = self.write(json!({"id":message["id"],"error":{"code":-32601,"message":"Unsupported host request"}}));
                return;
            };
            let _ = self.write(json!({"id":message["id"],"result":result}));
            return;
        }
        if method == "account/login/completed" || method == "account/updated" {
            let _ = self.app.emit(
                "ai-event",
                json!({"kind":"account","connectionId":self.connection_id,"success":params["success"]}),
            );
            return;
        }
        let Some(thread_id) = params["threadId"].as_str() else {
            return;
        };
        let Ok(mut sessions) = self.conversations.lock() else {
            return;
        };
        let Some(session) = sessions.get_mut(thread_id) else {
            return;
        };
        if method == "turn/started" {
            session.turn_id = params["turn"]["id"].as_str().map(str::to_string);
        }
        let event_turn = if method == "turn/completed" {
            params["turn"]["id"].as_str()
        } else {
            params["turnId"].as_str()
        };
        if let (Some(active), Some(event)) = (&session.turn_id, event_turn) {
            if active != event {
                return;
            }
        }
        let event = match method {
            "item/agentMessage/delta" => {
                Some(json!({"kind":"delta","itemId":params["itemId"],"text":params["delta"]}))
            }
            "item/completed" if params["item"]["type"] == "agentMessage" => Some(
                json!({"kind":"message","itemId":params["item"]["id"],"text":params["item"]["text"]}),
            ),
            "turn/completed" => {
                session.busy = false;
                session.turn_id = None;
                Some(
                    json!({"kind":"completed","status":params["turn"]["status"],"failed":!params["turn"]["error"].is_null(), "errorCode": if params["turn"]["error"].is_null() { None } else { Some(error_code(&params["turn"]["error"])) }, "errorDetail":error_detail(&params["turn"]["error"])}),
                )
            }
            "error" => Some(
                json!({"kind":"error","retrying":params["willRetry"],"errorCode":error_code(&params["error"]),"errorDetail":error_detail(&params["error"])}),
            ),
            _ => None,
        };
        if let Some(mut event) = event {
            event["connectionId"] = json!(self.connection_id);
            event["vaultId"] = json!(session.vault_id);
            event["requestId"] = json!(session.request_id);
            let _ = self.app.emit("ai-event", event);
        }
        if method == "turn/completed" && session.purpose.is_study() {
            sessions.remove(thread_id);
        }
    }
}
