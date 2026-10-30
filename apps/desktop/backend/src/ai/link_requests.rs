use super::tools;
use crate::runtime::AppContext;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, MutexGuard,
    },
    time::Duration,
};

type Answer = Result<(), String>;
const MAX_LINK_RETRIES: usize = 3;
const LINK_REQUEST_LIFETIME: Duration = Duration::from_secs(30);

#[derive(Default)]
pub(crate) struct LinkRetryBudget {
    failures: Mutex<usize>,
    mutation_gate: Mutex<()>,
}

impl LinkRetryBudget {
    fn begin_attempt(&self) -> Result<MutexGuard<'_, ()>, String> {
        let guard = self.mutation_gate.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        let failures = *self.failures.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        if failures > MAX_LINK_RETRIES {
            Err("AI_LINK_RETRIES_EXHAUSTED: The initial attempt and three retries have failed. Do not call link_note_mentions again in this turn; explain the outcome to the user plainly.".into())
        } else {
            Ok(guard)
        }
    }

    fn finish_attempt(&self, result: Result<Value, String>) -> Result<Value, String> {
        match result {
            Ok(value) => {
                *self.failures.lock().map_err(|_| "AI_REQUEST_FAILED")? = 0;
                Ok(value)
            }
            Err(error) if is_recoverable_link_error(&error) => {
                let mut failures = self.failures.lock().map_err(|_| "AI_REQUEST_FAILED")?;
                *failures += 1;
                let retries_used = failures.saturating_sub(1);
                if retries_used >= MAX_LINK_RETRIES {
                    return Err(format!(
                        "AI_LINK_RETRIES_EXHAUSTED: The initial attempt and three retries failed. Last tool error: {error}. Do not call link_note_mentions again in this turn; explain the outcome to the user plainly."
                    ));
                }

                let retries_remaining = MAX_LINK_RETRIES - retries_used;
                Err(format!(
                    "{error}\nAI_LINK_RECOVERY_REQUIRED: This attempt did not apply a change. You MUST NOT give the user a failure answer or speculate about the cause yet. Reread the current source and target note(s), reassess whether the requested link still makes sense, then recompute the revision and Unicode offsets before retrying. Do not reuse the failed arguments. {retries_remaining} retries remain after the initial attempt. If the link is no longer relevant or safe, stop and explain that naturally."
                ))
            }
            Err(error) => Err(error),
        }
    }
}

fn is_recoverable_link_error(error: &str) -> bool {
    [
        "AI_NOTE_REVISION_MISMATCH",
        "AI_NOTE_EDITOR_CHANGED",
        "AI_MENTION_TEXT_MISMATCH",
        "AI_PROTECTED_TEXT",
        "AI_PARTIAL_WORD",
        "AI_INVALID_MENTION_RANGE",
        "AI_INVALID_MENTIONS",
        "AI_INVALID_LINK_RANGE",
        "AI_INVALID_LINK_TARGET",
        "AI_EMPTY_LINK_LABEL",
    ]
    .iter()
    .any(|code| error.starts_with(code))
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct LinkRequestBinding {
    connection_id: String,
    vault_id: String,
    request_id: String,
}

struct PendingLinkRequest {
    binding: LinkRequestBinding,
    created: std::time::Instant,
    send: mpsc::Sender<Answer>,
}

#[derive(Default)]
pub(crate) struct LinkRequests(Mutex<HashMap<String, PendingLinkRequest>>);

impl LinkRequests {
    fn register(
        &self,
        binding: LinkRequestBinding,
    ) -> Result<(String, mpsc::Receiver<Answer>), String> {
        let mut requests = self.0.lock().map_err(|_| "AI_REQUEST_FAILED")?;
        requests.retain(|_, request| request.created.elapsed() < LINK_REQUEST_LIFETIME);
        if requests.len() >= 16 {
            return Err("AI_BUSY".into());
        }
        let ticket = uuid::Uuid::new_v4().to_string();
        let (send, receive) = mpsc::channel();
        requests.insert(
            ticket.clone(),
            PendingLinkRequest {
                binding,
                created: std::time::Instant::now(),
                send,
            },
        );
        Ok((ticket, receive))
    }

    fn complete(
        &self,
        ticket: &str,
        binding: &LinkRequestBinding,
        approved: bool,
        error: Option<String>,
    ) -> Result<(), String> {
        self.complete_at(ticket, binding, approved, error, std::time::Instant::now())
    }

    fn complete_at(
        &self,
        ticket: &str,
        binding: &LinkRequestBinding,
        approved: bool,
        error: Option<String>,
        now: std::time::Instant,
    ) -> Result<(), String> {
        let pending = {
            let mut requests = self.0.lock().map_err(|_| "AI_REQUEST_FAILED")?;
            let request = requests.get(ticket).ok_or("AI_LINK_REQUEST_EXPIRED")?;
            if now.saturating_duration_since(request.created) >= LINK_REQUEST_LIFETIME {
                requests.remove(ticket);
                return Err("AI_LINK_REQUEST_EXPIRED".into());
            }
            if &request.binding != binding {
                return Err("AI_LINK_REQUEST_MISMATCH".into());
            }
            requests.remove(ticket).ok_or("AI_LINK_REQUEST_EXPIRED")?
        };
        let answer = match (approved, error) {
            (_, Some(error)) => Err(error),
            (true, None) => Ok(()),
            (false, None) => Err("AI_LINK_DENIED: The user declined this link change. Do not retry or make the change through another tool.".into()),
        };
        pending
            .send
            .send(answer)
            .map_err(|_| "AI_LINK_REQUEST_EXPIRED".into())
    }

    fn remove(&self, ticket: &str) {
        if let Ok(mut requests) = self.0.lock() {
            requests.remove(ticket);
        }
    }
}

pub(super) fn apply(
    app: &AppContext,
    vault_id: &str,
    connection_id: &str,
    request_id: &str,
    retry_budget: &LinkRetryBudget,
    args: &Value,
) -> Result<Value, String> {
    let _attempt_guard = retry_budget.begin_attempt()?;
    let result = (|| {
        let directory = tools::resolve_vault(app, vault_id)?;
        let patch = tools::call(&directory, "link_note_mentions", args)?;
        let state = app.state::<LinkRequests>();
        let binding = LinkRequestBinding {
            connection_id: connection_id.into(),
            vault_id: vault_id.into(),
            request_id: request_id.into(),
        };
        let (ticket, receive) = state.register(binding)?;
        let result = (|| {
            app.emit("ai-link-request", json!({"ticket":ticket,"vaultId":vault_id,"connectionId":connection_id,"requestId":request_id,"patch":patch}))
                .map_err(|_| "AI_REQUEST_FAILED")?;
            receive
                .recv_timeout(LINK_REQUEST_LIFETIME)
                .map_err(|_| "AI_LINK_APPLY_TIMEOUT")??;
            Ok(
                json!({"id":patch["noteId"],"reference":format!("[[{}]]", patch["noteId"].as_str().unwrap_or_default()),"applied":patch["links"].as_array().map_or(0, Vec::len),"links":patch["links"]}),
            )
        })();
        state.remove(&ticket);
        result
    })();
    retry_budget.finish_attempt(result)
}

pub(crate) fn complete_ai_link_request(
    app: AppContext,
    ticket: String,
    connection_id: String,
    vault_id: String,
    request_id: String,
    approved: bool,
    error: Option<String>,
) -> Result<(), String> {
    app.state::<LinkRequests>().complete(
        &ticket,
        &LinkRequestBinding {
            connection_id,
            vault_id,
            request_id,
        },
        approved,
        error,
    )
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
    link_retry_budget: Arc<LinkRetryBudget>,
}
impl Bridge {
    pub(super) fn start(app: AppContext) -> Result<Self, String> {
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
                            &context.link_retry_budget,
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
            link_retry_budget: Arc::new(LinkRetryBudget::default()),
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

#[cfg(test)]
mod tests {
    use super::{
        is_recoverable_link_error, LinkRequestBinding, LinkRequests, LinkRetryBudget,
        LINK_REQUEST_LIFETIME, MAX_LINK_RETRIES,
    };
    use serde_json::json;

    fn fail(budget: &LinkRetryBudget, error: &str) -> String {
        let _attempt_guard = budget.begin_attempt().unwrap();
        budget.finish_attempt(Err(error.into())).unwrap_err()
    }

    #[test]
    fn offers_three_retries_after_a_recoverable_conflict_then_exhausts() {
        let budget = LinkRetryBudget::default();
        let first = fail(&budget, "AI_NOTE_REVISION_MISMATCH: stale");
        assert!(first.contains("3 retries remain"));

        for remaining in [2, 1] {
            let error = fail(&budget, "AI_NOTE_EDITOR_CHANGED: stale");
            assert!(error.contains(&format!("{remaining} retries remain")));
        }

        let exhausted = fail(&budget, "AI_MENTION_TEXT_MISMATCH: stale");
        assert!(exhausted.starts_with("AI_LINK_RETRIES_EXHAUSTED:"));
        assert!(budget.begin_attempt().is_err());
    }

    #[test]
    fn successful_mutation_resets_the_retry_budget() {
        let budget = LinkRetryBudget::default();
        fail(&budget, "AI_NOTE_REVISION_MISMATCH: stale");

        let _attempt_guard = budget.begin_attempt().unwrap();
        assert_eq!(
            budget.finish_attempt(Ok(json!({"applied":1}))).unwrap(),
            json!({"applied":1})
        );
        drop(_attempt_guard);
        for _ in 0..=MAX_LINK_RETRIES {
            let _attempt_guard = budget.begin_attempt().unwrap();
        }
    }

    #[test]
    fn only_recoverable_link_errors_consume_the_retry_budget() {
        let budget = LinkRetryBudget::default();
        assert!(!is_recoverable_link_error("AI_LINK_APPLY_TIMEOUT"));
        {
            let _attempt_guard = budget.begin_attempt().unwrap();
            budget
                .finish_attempt(Err("AI_LINK_APPLY_TIMEOUT".into()))
                .unwrap_err();
        }

        let error = fail(&budget, "AI_NOTE_REVISION_MISMATCH: stale");
        assert!(error.contains("3 retries remain"));
    }

    fn binding() -> LinkRequestBinding {
        LinkRequestBinding {
            connection_id: "connection-a".into(),
            vault_id: "vault-a".into(),
            request_id: "request-a".into(),
        }
    }

    #[test]
    fn link_request_requires_explicit_approval() {
        let requests = LinkRequests::default();
        let (ticket, receive) = requests.register(binding()).unwrap();
        requests.complete(&ticket, &binding(), false, None).unwrap();
        assert!(receive
            .recv()
            .unwrap()
            .unwrap_err()
            .starts_with("AI_LINK_DENIED:"));
    }

    #[test]
    fn link_request_approval_is_bound_to_connection_vault_and_request() {
        let requests = LinkRequests::default();
        let (ticket, receive) = requests.register(binding()).unwrap();
        for wrong in [
            LinkRequestBinding {
                connection_id: "connection-b".into(),
                ..binding()
            },
            LinkRequestBinding {
                vault_id: "vault-b".into(),
                ..binding()
            },
            LinkRequestBinding {
                request_id: "request-b".into(),
                ..binding()
            },
        ] {
            assert_eq!(
                requests.complete(&ticket, &wrong, true, None).unwrap_err(),
                "AI_LINK_REQUEST_MISMATCH"
            );
        }
        requests.complete(&ticket, &binding(), true, None).unwrap();
        assert_eq!(receive.recv().unwrap(), Ok(()));
    }

    #[test]
    fn link_request_approval_expires() {
        let requests = LinkRequests::default();
        let (ticket, receive) = requests.register(binding()).unwrap();
        let expired_at = std::time::Instant::now() + LINK_REQUEST_LIFETIME;
        assert_eq!(
            requests
                .complete_at(&ticket, &binding(), true, None, expired_at)
                .unwrap_err(),
            "AI_LINK_REQUEST_EXPIRED"
        );
        assert!(receive.recv().is_err());
    }
}
