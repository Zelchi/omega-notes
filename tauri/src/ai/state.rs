use super::providers::codex::Client;
use std::sync::{Arc, Mutex};

pub(crate) struct AiState(pub(super) Mutex<Option<Arc<Client>>>, pub(super) Mutex<()>);
impl Default for AiState {
    fn default() -> Self {
        Self(Mutex::new(None), Mutex::new(()))
    }
}
impl AiState {
    pub(crate) fn shutdown(&self) {
        if let Ok(mut slot) = self.0.lock() {
            if let Some(client) = slot.take() {
                client.stop();
            }
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
    }
}
