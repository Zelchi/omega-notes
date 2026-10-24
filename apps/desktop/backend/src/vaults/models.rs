use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vault {
    pub(crate) id: String,
    pub(crate) name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultRegistry {
    pub(crate) version: u8,
    pub(crate) active_vault_id: Option<String>,
    pub(crate) vaults: Vec<Vault>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultLibrary {
    pub(crate) vaults: Vec<Vault>,
    pub(crate) active_vault_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultDetails {
    pub(crate) note_count: usize,
    pub(crate) image_count: usize,
    pub(crate) audio_count: usize,
    pub(crate) video_count: usize,
    pub(crate) character_count: usize,
    pub(crate) created_at: u64,
    pub(crate) storage_bytes: u64,
    pub(crate) last_modified_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultDeleteResult {
    pub(crate) library: VaultLibrary,
    pub(crate) cleanup_error: Option<String>,
}
