use serde_json::Value;

/// HTTP status alone cannot establish whether a Go subscription is missing.
pub(super) fn classify(error: &Value, is_go: bool) -> &'static str {
    let message = error["message"].as_str().unwrap_or("").to_ascii_lowercase();
    let kind = error["type"].as_str().unwrap_or("").to_ascii_lowercase();
    let code = error["code"].as_str().unwrap_or("").to_ascii_lowercase();
    let status = error["status"]
        .as_u64()
        .or_else(|| error["statusCode"].as_u64());
    let contains = |patterns: &[&str]| patterns.iter().any(|pattern| message.contains(pattern));
    if message.contains("free tier") && message.contains("only") && message.contains("opencode") {
        return "AI_OPENCODE_FREE_TIER_REJECTED";
    }
    if is_go
        && (matches!(
            code.as_str(),
            "subscription_required"
                | "subscription_not_found"
                | "no_active_subscription"
                | "subscription_expired"
        ) || contains(&[
            "subscription required",
            "subscription is required",
            "requires a subscription",
            "no active subscription",
            "no subscription",
            "not subscribed",
            "subscription expired",
            "subscription has expired",
            "subscription is inactive",
            "subscribe to opencode go",
        ]))
    {
        return "AI_OPENCODE_GO_SUBSCRIPTION_REQUIRED";
    }
    if contains(&[
        "invalid api key",
        "invalid_api_key",
        "missing api key",
        "invalid token",
        "expired token",
    ]) || matches!(
        code.as_str(),
        "invalid_api_key" | "invalid_token" | "authentication_required"
    ) {
        return "AI_OPENCODE_AUTH_FAILED";
    }
    if contains(&[
        "insufficient balance",
        "insufficient credit",
        "not enough credit",
        "no credits",
        "balance is zero",
        "out of credit",
    ]) || matches!(
        code.as_str(),
        "insufficient_balance" | "insufficient_credits"
    ) {
        return "AI_OPENCODE_CREDITS_REQUIRED";
    }
    if status == Some(429)
        || kind == "provider.rate_limit"
        || contains(&[
            "rate limit",
            "usage limit",
            "quota exceeded",
            "quota exhausted",
            "limit reached",
            "too many requests",
        ])
    {
        return "AI_OPENCODE_LIMIT_REACHED";
    }
    if status == Some(402) {
        return "AI_OPENCODE_BILLING_REQUIRED";
    }
    if status == Some(403) {
        return "AI_OPENCODE_ACCESS_DENIED";
    }
    if status == Some(401)
        || matches!(kind.as_str(), "auth" | "authentication" | "provider.auth")
        || contains(&["not authenticated", "unauthorized"])
    {
        return "AI_OPENCODE_AUTH_FAILED";
    }
    if kind == "provider.model_not_found"
        || contains(&["model not found", "model does not exist", "unknown model"])
    {
        return "AI_OPENCODE_MODEL_UNAVAILABLE";
    }
    if status.is_some_and(|status| status >= 500) {
        return "AI_OPENCODE_SERVICE_FAILED";
    }
    if matches!(kind.as_str(), "provider.transport" | "provider.network")
        || contains(&[
            "failed to fetch",
            "fetch failed",
            "connection refused",
            "econnrefused",
            "econnreset",
            "enotfound",
            "network error",
            "network unavailable",
            "connection timed out",
            "certificate",
        ])
    {
        return "AI_OPENCODE_CONNECTION_FAILED";
    }
    "AI_OPENCODE_REQUEST_REJECTED"
}
