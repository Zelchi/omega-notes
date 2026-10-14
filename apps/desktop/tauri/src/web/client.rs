use reqwest::{redirect::Policy, Client};
use std::time::Duration;

pub(super) fn build_client() -> Result<Client, reqwest::Error> {
    // An existing provider is already usable if another client initialized TLS first.
    let _ = rustls::crypto::ring::default_provider().install_default();
    Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(4))
        .redirect(Policy::limited(5))
        .user_agent(concat!("OmegaNotes/", env!("CARGO_PKG_VERSION")))
        .build()
}
