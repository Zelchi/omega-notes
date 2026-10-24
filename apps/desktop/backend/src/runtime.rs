use serde::Serialize;
use serde_json::{json, Value};
use std::{
    any::{Any, TypeId},
    collections::HashMap,
    io::{self, Write},
    marker::PhantomData,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
pub(crate) fn executor() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("backend runtime")
    })
}
pub(crate) fn spawn_blocking<F, R>(operation: F) -> tokio::task::JoinHandle<R>
where
    F: FnOnce() -> R + Send + 'static,
    R: Send + 'static,
{
    executor().spawn_blocking(operation)
}
pub(crate) fn spawn<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    executor().spawn(future)
}
pub(crate) fn block_on<F: std::future::Future>(future: F) -> F::Output {
    executor().block_on(future)
}

type States = HashMap<TypeId, Box<dyn Any + Send + Sync>>;
struct Context {
    documents: PathBuf,
    cache: PathBuf,
    states: States,
    output: Mutex<Box<dyn Write + Send>>,
}

#[derive(Clone)]
pub(crate) struct AppContext(Arc<Context>);
impl AppContext {
    pub(crate) fn new(documents: PathBuf, cache: PathBuf, output: Box<dyn Write + Send>) -> Self {
        let mut states: States = HashMap::new();
        macro_rules! manage {
            ($value:expr) => {{
                let value = $value;
                states.insert(Any::type_id(&value), Box::new(value));
            }};
        }
        manage!(crate::app::runtime::ActiveVault(Mutex::new(None)));
        manage!(crate::ai::AiState::default());
        manage!(crate::terminal::TerminalState::default());
        manage!(crate::pomodoro::PomodoroTimer::default());
        manage!(crate::ai::link_requests::LinkRequests::default());
        manage!(crate::updates::UpdateState::default());
        Self(Arc::new(Context {
            documents,
            cache,
            states,
            output: Mutex::new(output),
        }))
    }
    pub(crate) fn state<T: Any + Send + Sync>(&self) -> &T {
        self.0
            .states
            .get(&TypeId::of::<T>())
            .and_then(|value| value.downcast_ref())
            .expect("registered backend state")
    }
    pub(crate) fn documents_dir(&self) -> io::Result<PathBuf> {
        Ok(self.0.documents.clone())
    }
    pub(crate) fn cache_dir(&self) -> io::Result<PathBuf> {
        Ok(self.0.cache.clone())
    }
    pub(crate) fn emit<T: Serialize>(&self, event: &str, payload: T) -> Result<(), String> {
        self.write(&json!({"event":event,"payload":payload}))
    }
    pub(crate) fn write(&self, value: &Value) -> Result<(), String> {
        let mut output = self
            .0
            .output
            .lock()
            .map_err(|_| "Backend output unavailable")?;
        serde_json::to_writer(&mut *output, value).map_err(|error| error.to_string())?;
        output
            .write_all(b"\n")
            .and_then(|_| output.flush())
            .map_err(|error| error.to_string())
    }
    pub(crate) fn shutdown(&self) {
        self.state::<crate::ai::AiState>().shutdown();
        self.state::<crate::terminal::TerminalState>().shutdown();
    }
}

pub(crate) struct Channel<T> {
    app: AppContext,
    id: String,
    marker: PhantomData<T>,
}
impl<T> Clone for Channel<T> {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            id: self.id.clone(),
            marker: PhantomData,
        }
    }
}
impl<T: Serialize> Channel<T> {
    pub(crate) fn from_argument(app: &AppContext, args: &Value, key: &str) -> Result<Self, String> {
        let id = args
            .get(key)
            .and_then(|value| value.get("__omegaChannel"))
            .and_then(Value::as_str)
            .filter(|id| uuid::Uuid::parse_str(id).is_ok())
            .ok_or_else(|| format!("Invalid channel {key}"))?;
        Ok(Self {
            app: app.clone(),
            id: id.into(),
            marker: PhantomData,
        })
    }
    pub(crate) fn send(&self, payload: T) -> Result<(), String> {
        self.app
            .write(&json!({"channel":self.id,"payload":payload}))
    }
}
