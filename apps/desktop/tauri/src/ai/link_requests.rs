use super::tools;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

type Answer = Result<(), String>;
#[derive(Default)]
pub(crate) struct LinkRequests(Mutex<HashMap<String, mpsc::Sender<Answer>>>);

pub(super) fn apply(
    app: &AppHandle,
    vault_id: &str,
    connection_id: &str,
    request_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let directory = tools::resolve_vault(app, vault_id)?;
    let patch = tools::call(&directory, "link_note_mentions", args)?;
    let ticket = uuid::Uuid::new_v4().to_string();
    let (send, receive) = mpsc::channel();
    let state = app.state::<LinkRequests>();
    {
        let mut requests = state.0.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if requests.len() >= 16 {
            return Err("AI_BUSY".into());
        }
        requests.insert(ticket.clone(), send);
    }
    let result = (|| {
        app.emit("ai-link-request", json!({"ticket":ticket,"vaultId":vault_id,"connectionId":connection_id,"requestId":request_id,"patch":patch}))
            .map_err(|_| "AI_REQUEST_FAILED")?;
        receive
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "AI_LINK_APPLY_TIMEOUT")??;
        Ok(
            json!({"id":patch["noteId"],"reference":format!("[[{}]]", patch["noteId"].as_str().unwrap_or_default()),"applied":patch["links"].as_array().map_or(0, Vec::len),"links":patch["links"]}),
        )
    })();
    if let Ok(mut requests) = state.0.lock() {
        requests.remove(&ticket);
    }
    result
}

#[tauri::command]
pub(crate) fn complete_ai_link_request(
    app: AppHandle,
    ticket: String,
    error: Option<String>,
) -> Result<(), String> {
    let send = app
        .state::<LinkRequests>()
        .0
        .lock()
        .map_err(|_| "AI_REQUEST_FAILED")?
        .remove(&ticket)
        .ok_or("AI_LINK_REQUEST_EXPIRED")?;
    send.send(error.map_or(Ok(()), Err))
        .map_err(|_| "AI_LINK_REQUEST_EXPIRED".into())
}

pub(super) struct Bridge {
    port: u16,
    token: String,
    stopped: Arc<AtomicBool>,
    active: Arc<Mutex<Option<BridgeContext>>>,
}
#[derive(Clone)]
struct BridgeContext {
    vault: String,
    connection: String,
    request: String,
    purpose: super::task::Purpose,
}
impl Bridge {
    pub(super) fn start(app: AppHandle) -> Result<Self, String> {
        let listener =
            TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|_| "AI_START_FAILED")?;
        let port = listener.local_addr().map_err(|_| "AI_START_FAILED")?.port();
        let token = uuid::Uuid::new_v4().to_string();
        let secret = token.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let active = Arc::new(Mutex::new(None::<BridgeContext>));
        let current = active.clone();
        std::thread::spawn(move || {
            for socket in listener.incoming() {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(mut socket) = socket else {
                    break;
                };
                let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
                let _ = socket.set_write_timeout(Some(Duration::from_secs(2)));
                let response = (|| -> Result<Value, String> {
                    let mut line = String::new();
                    BufReader::new(&socket)
                        .take(1024 * 1024)
                        .read_line(&mut line)
                        .map_err(|_| "AI_PROTOCOL_ERROR")?;
                    if !line.ends_with('\n') {
                        return Err("AI_PROTOCOL_ERROR".into());
                    }
                    let message: Value =
                        serde_json::from_str(&line).map_err(|_| "AI_PROTOCOL_ERROR")?;
                    if message["token"].as_str() != Some(&secret) || stop.load(Ordering::SeqCst) {
                        return Err("AI_CANCELLED".into());
                    }
                    let context = current
                        .lock()
                        .map_err(|_| "AI_REQUEST_FAILED")?
                        .clone()
                        .ok_or("AI_TURN_FINISHED")?;
                    let tool = message["tool"].as_str().unwrap_or("link_note_mentions");
                    if !tools::allowed_for(context.purpose, tool) {
                        return Err("AI_UNKNOWN_TOOL".into());
                    }
                    match tool {
                        "read_study_context" => {
                            let directory = tools::resolve_vault(&app, &context.vault)?;
                            tools::call_for_request(
                                &directory,
                                &context.request,
                                "read_study_context",
                                &message["arguments"],
                            )
                        }
                        "link_note_mentions" => apply(
                            &app,
                            &context.vault,
                            &context.connection,
                            &context.request,
                            &message["arguments"],
                        ),
                        _ => Err("AI_UNKNOWN_TOOL".into()),
                    }
                })();
                let response = match response {
                    Ok(value) => json!({"result":value}),
                    Err(error) => json!({"error":error}),
                };
                let _ = writeln!(socket, "{response}");
            }
        });
        Ok(Self {
            port,
            token,
            stopped,
            active,
        })
    }
    pub(super) fn activate(
        &self,
        vault: String,
        connection: String,
        request: String,
        purpose: super::task::Purpose,
    ) -> Result<(), String> {
        let mut active = self.active.lock().map_err(|_| "AI_DISCONNECTED")?;
        if self.stopped.load(Ordering::SeqCst) || active.is_some() {
            return Err("AI_BUSY".into());
        }
        *active = Some(BridgeContext {
            vault,
            connection,
            request,
            purpose,
        });
        Ok(())
    }
    pub(super) fn deactivate(&self, request: &str) {
        if let Ok(mut active) = self.active.lock() {
            if active
                .as_ref()
                .is_some_and(|context| context.request == request)
            {
                *active = None;
            }
        }
    }
    pub(super) fn arguments(&self) -> Value {
        json!([self.port.to_string(), self.token])
    }
    pub(super) fn stop(&self) {
        if !self.stopped.swap(true, Ordering::SeqCst) {
            if let Ok(mut active) = self.active.lock() {
                *active = None;
            }
            let _ = TcpStream::connect((Ipv4Addr::LOCALHOST, self.port));
        }
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(super) fn forward(port: &str, token: &str, arguments: &Value) -> Result<Value, String> {
    forward_tool(port, token, "link_note_mentions", arguments)
}

pub(super) fn forward_tool(
    port: &str,
    token: &str,
    tool: &str,
    arguments: &Value,
) -> Result<Value, String> {
    let port: u16 = port.parse().map_err(|_| "AI_PROTOCOL_ERROR")?;
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    let mut socket = TcpStream::connect_timeout(&address.into(), Duration::from_secs(2))
        .map_err(|_| "AI_DISCONNECTED")?;
    socket
        .set_read_timeout(Some(Duration::from_secs(35)))
        .map_err(|_| "AI_REQUEST_FAILED")?;
    socket
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|_| "AI_REQUEST_FAILED")?;
    writeln!(
        socket,
        "{}",
        json!({"token":token,"tool":tool,"arguments":arguments})
    )
    .map_err(|_| "AI_REQUEST_FAILED")?;
    let mut line = String::new();
    BufReader::new(socket)
        .take(1024 * 1024)
        .read_line(&mut line)
        .map_err(|_| "AI_REQUEST_FAILED")?;
    let response: Value = serde_json::from_str(&line).map_err(|_| "AI_PROTOCOL_ERROR")?;
    if let Some(error) = response["error"].as_str() {
        return Err(error.into());
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "AI_PROTOCOL_ERROR".into())
}
