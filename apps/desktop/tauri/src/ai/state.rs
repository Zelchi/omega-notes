use super::providers::codex::Client;
use super::{providers::cli, repository::Provider};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

pub(crate) struct AiState(
    pub(super) Mutex<Option<Arc<Client>>>,
    pub(super) Mutex<()>,
    pub(super) Mutex<HashMap<Provider, Arc<cli::Client>>>,
);
impl Default for AiState {
    fn default() -> Self {
        Self(Mutex::new(None), Mutex::new(()), Mutex::new(HashMap::new()))
    }
}
impl AiState {
    pub(crate) fn shutdown(&self) {
        if let Ok(mut slot) = self.0.lock() {
            if let Some(client) = slot.take() {
                client.stop();
            }
        }
        let clients: Vec<_> = self
            .2
            .lock()
            .map(|mut clients| clients.drain().map(|(_, client)| client).collect())
            .unwrap_or_default();
        for client in clients {
            client.stop();
        }
    }
}
impl Drop for AiState {
    fn drop(&mut self) {
        if let Ok(slot) = self.0.get_mut() {
            if let Some(client) = slot.take() {
                client.stop();
            }
        }
        if let Ok(clients) = self.2.get_mut() {
            for (_, client) in clients.drain() {
                client.stop();
            }
        }
    }
}
