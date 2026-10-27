use reqwest::{
    dns::{Addrs, Name, Resolve, Resolving},
    redirect::Policy,
    Client, Url,
};
use std::{
    io,
    net::{IpAddr, SocketAddr},
    time::Duration,
};

pub(super) const MEDIA_STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(15);

struct PublicNetworkResolver;

impl Resolve for PublicNetworkResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let addresses = match host.parse::<IpAddr>() {
                Ok(ip) => vec![SocketAddr::new(ip, 0)],
                Err(_) => tokio::net::lookup_host((host.as_str(), 0)).await?.collect(),
            };
            let addresses = validate_public_addresses(addresses)?;
            let addresses: Addrs = Box::new(addresses.into_iter());
            Ok(addresses)
        })
    }
}

pub(super) fn is_safe_target_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| {
            let host = host
                .strip_prefix('[')
                .and_then(|host| host.strip_suffix(']'))
                .unwrap_or(host);
            match host.parse::<IpAddr>() {
                Ok(ip) => is_public_ip(ip),
                Err(_) => true,
            }
        })
}

pub(super) fn is_safe_https_target_url(url: &Url) -> bool {
    url.scheme() == "https" && is_safe_target_url(url)
}

pub(super) fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            const NON_PUBLIC: [(u32, u8); 15] = [
                (0x0000_0000, 8),  // This network
                (0x0a00_0000, 8),  // Private-use
                (0x6440_0000, 10), // Shared address space
                (0x7f00_0000, 8),  // Loopback
                (0xa9fe_0000, 16), // Link-local
                (0xac10_0000, 12), // Private-use
                (0xc000_0000, 24), // IETF protocol assignments
                (0xc000_0200, 24), // Documentation
                (0xc058_6300, 24), // Deprecated 6to4 relay
                (0xc0a8_0000, 16), // Private-use
                (0xc612_0000, 15), // Network benchmark tests
                (0xc633_6400, 24), // Documentation
                (0xcb00_7100, 24), // Documentation
                (0xe000_0000, 4),  // Multicast
                (0xf000_0000, 4),  // Reserved and broadcast
            ];
            let address = u32::from(ip);
            !NON_PUBLIC
                .iter()
                .any(|(network, prefix)| address >> (32 - prefix) == network >> (32 - prefix))
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000
                && !(segments[0] == 0x2001 && segments[1] & 0xfe00 == 0)
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && segments[0] != 0x2002
                && !(segments[0] == 0x3fff && segments[1] & 0xfff0 == 0)
        }
    }
}

pub(super) fn validate_public_addresses(addresses: Vec<SocketAddr>) -> io::Result<Vec<SocketAddr>> {
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "URL host resolves to a non-public address",
        ));
    }
    Ok(addresses)
}

pub(super) fn build_client() -> Result<Client, reqwest::Error> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let redirects = Policy::custom(|attempt| {
        if attempt.previous().len() > 5 || !is_safe_target_url(attempt.url()) {
            attempt.error(io::Error::other("Unsafe URL redirect"))
        } else {
            attempt.follow()
        }
    });
    Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(4))
        .no_proxy()
        .redirect(redirects)
        .dns_resolver(PublicNetworkResolver)
        .user_agent(concat!("OmegaNotes/", env!("CARGO_PKG_VERSION")))
        .build()
}

pub(super) fn build_media_stream_client() -> Result<Client, reqwest::Error> {
    build_media_stream_client_with(
        Client::builder().dns_resolver(PublicNetworkResolver),
        MEDIA_STREAM_IDLE_TIMEOUT,
    )
}

pub(super) fn build_media_stream_client_with(
    builder: reqwest::ClientBuilder,
    idle_timeout: Duration,
) -> Result<Client, reqwest::Error> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let redirects = Policy::custom(|attempt| {
        if attempt.previous().len() > 5 || !is_safe_https_target_url(attempt.url()) {
            attempt.error(io::Error::other("Unsafe media stream redirect"))
        } else {
            attempt.follow()
        }
    });
    builder
        .connect_timeout(Duration::from_secs(4))
        .read_timeout(idle_timeout)
        .no_proxy()
        .redirect(redirects)
        .user_agent(concat!("OmegaNotes/", env!("CARGO_PKG_VERSION")))
        .build()
}
