mod chat_prompt;
mod oneshot;
mod open_session;
mod persistent_session;
#[cfg(test)]
mod persistent_session_tests;
mod persistent_turn;
mod run;
mod stream_framing;

use self::open_session::{validate_opencode_session_id, OpenCodeSession};
use self::persistent_session::PersistentSession;
use self::run::Run;
use super::{antigravity, claude, opencode, opencode_catalog, process};
use crate::ai::repository::Provider;
use crate::runtime::AppContext;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub(crate) struct Client {
    pub(crate) provider: Provider,
    binary: process::Executable,
    app: AppContext,
    connection_id: String,
    alive: AtomicBool,
    runs: Mutex<HashMap<String, Arc<Run>>>,
    sessions: Mutex<HashMap<String, Arc<PersistentSession>>>,
    open_sessions: Mutex<HashMap<String, Arc<OpenCodeSession>>>,
    authenticated: Mutex<Option<bool>>,
    pub(crate) operation: Mutex<()>,
}

impl Client {
    pub(crate) fn start(app: AppContext, provider: Provider) -> Result<Arc<Self>, String> {
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

    fn emit(&self, vault: &str, request: &str, mut event: Value) {
        event["connectionId"] = json!(self.connection_id);
        event["vaultId"] = json!(vault);
        event["requestId"] = json!(request);
        let _ = self.app.emit("ai-event", event);
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
                if session.cancel(request_id) {
                    if let Ok(mut sessions) = self.sessions.lock() {
                        if sessions
                            .get(vault_id)
                            .is_some_and(|current| Arc::ptr_eq(current, &session))
                        {
                            sessions.remove(vault_id);
                        }
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
