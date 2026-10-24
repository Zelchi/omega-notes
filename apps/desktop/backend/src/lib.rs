mod ai;
mod app;
mod dispatch;
mod images;
mod media;
mod names;
mod notes;
mod pomodoro;
mod runtime;
mod storage;
mod terminal;
mod updates;
mod vaults;
mod web;

use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Read},
    path::PathBuf,
};

pub struct DesktopBackend {
    app: runtime::AppContext,
}

impl DesktopBackend {
    pub fn new(
        documents_dir: PathBuf,
        cache_dir: PathBuf,
        output: Box<dyn io::Write + Send>,
    ) -> Result<Self, String> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let app = runtime::AppContext::new(documents_dir, cache_dir, output);
        app::setup::initialize(app.clone()).map_err(|error| error.to_string())?;
        Ok(Self { app })
    }

    pub async fn invoke(&self, command: String, args: Value) -> Result<Value, String> {
        dispatch::dispatch(self.app.clone(), command, args).await
    }

    pub fn shutdown(&self) {
        self.app.shutdown();
    }
}

impl Drop for DesktopBackend {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Deserialize)]
struct Request {
    id: u64,
    command: String,
    #[serde(default)]
    args: Value,
}

pub fn run() -> Result<(), String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    if ai::run_if_requested() || terminal::run_if_requested() {
        return Ok(());
    }
    let verify_args: Vec<_> = std::env::args_os().skip(1).collect();
    if verify_args
        .first()
        .is_some_and(|value| value == "--verify-update")
    {
        if verify_args.len() != 3 {
            return Err("Use --verify-update PACKAGE SIGNATURE".into());
        }
        return updates::verify_release(
            &PathBuf::from(&verify_args[1]),
            &PathBuf::from(&verify_args[2]),
        );
    }
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let parameter = |name: &str| -> Result<PathBuf, String> {
        args.windows(2)
            .find(|pair| pair[0] == name)
            .map(|pair| PathBuf::from(&pair[1]))
            .ok_or_else(|| format!("Missing {name}"))
    };
    let app = runtime::AppContext::new(
        parameter("--documents-dir")?,
        parameter("--cache-dir")?,
        Box::new(io::stdout()),
    );
    app::setup::initialize(app.clone()).map_err(|error| error.to_string())?;
    app.write(&json!({"ready":true}))?;
    let mut input = io::stdin().lock();
    let mut tasks = Vec::new();
    loop {
        let mut line = Vec::new();
        let read = (&mut input)
            .take(256 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut line)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        if read > 256 * 1024 * 1024 {
            app.shutdown();
            return Err("Backend request too large".into());
        }
        let request: Request = match serde_json::from_slice(&line) {
            Ok(request) => request,
            Err(error) => {
                app.write(&json!({"protocolError":error.to_string()}))?;
                continue;
            }
        };
        let context = app.clone();
        tasks.retain(|task: &tokio::task::JoinHandle<()>| !task.is_finished());
        tasks.push(runtime::spawn(async move {
            let operation = runtime::spawn(dispatch::dispatch(
                context.clone(),
                request.command,
                request.args,
            ));
            let result = operation
                .await
                .unwrap_or_else(|error| Err(format!("Backend command failed: {error}")));
            let response = match result {
                Ok(result) => json!({"id":request.id,"result":result}),
                Err(error) => json!({"id":request.id,"error":error}),
            };
            let _ = context.write(&response);
        }));
    }
    app.shutdown();
    runtime::block_on(async {
        let _ = tokio::time::timeout(std::time::Duration::from_secs(4), async {
            for task in tasks {
                let _ = task.await;
            }
        })
        .await;
    });
    Ok(())
}
