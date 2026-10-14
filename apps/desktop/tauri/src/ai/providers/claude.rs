use serde_json::Value;
use std::process::Command;

pub(super) fn supported_version(version: &str) -> bool {
    version.split_whitespace().any(|part| {
        let parts: Vec<_> = part.trim_start_matches('v').split('.').collect();
        if parts.len() != 3 {
            return false;
        }
        let parsed: Option<Vec<u32>> = parts.iter().map(|part| part.parse().ok()).collect();
        parsed.is_some_and(|version| version.as_slice() >= [2, 1, 248].as_slice())
    })
}

pub(super) fn authenticated(success: bool, output: &str) -> Result<bool, String> {
    let status: Value = serde_json::from_str(output).map_err(|_| "AI_CLAUDE_AUTH_CHECK_FAILED")?;
    let logged_in = status["loggedIn"]
        .as_bool()
        .ok_or("AI_CLAUDE_AUTH_CHECK_FAILED")?;
    Ok(success && logged_in)
}

pub(super) fn configure(
    command: &mut Command,
    mcp: Value,
    instructions: &str,
    model: Option<&str>,
    effort: Option<&str>,
) {
    command
        .args([
            "--restricted",
            "--setting-sources",
            "",
            "--disable-slash-commands",
            "--settings",
            "{\"disableAllHooks\":true,\"autoMemoryEnabled\":false}",
            "--print",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--no-session-persistence",
            "--tools",
            "",
            "--strict-mcp-config",
            "--permission-mode",
            "dontAsk",
            "--allowedTools",
            "mcp__omega__list_notes,mcp__omega__search_notes,mcp__omega__read_note",
            "--system-prompt",
            instructions,
        ])
        .env("CLAUDE_CODE_DISABLE_AUTO_MEMORY", "1")
        .arg("--mcp-config")
        .arg(mcp.to_string());
    if let Some(model) = model.filter(|model| !model.is_empty()) {
        command.arg("--model").arg(model);
    }
    if let Some(effort) = effort.filter(|effort| ["low", "medium", "high"].contains(effort)) {
        command.arg("--effort").arg(effort);
    }
}

pub(super) fn error_code(kind: &str, message: &str) -> &'static str {
    let message = message.to_ascii_lowercase();
    if kind == "authentication_failed"
        || message.contains("invalid api key")
        || message.contains("not logged in")
        || message.contains("authentication failed")
    {
        "AI_CLAUDE_AUTH_FAILED"
    } else if kind == "billing_error"
        || message.contains("credit balance")
        || message.contains("insufficient credit")
    {
        "AI_CLAUDE_BILLING_FAILED"
    } else if kind == "rate_limit"
        || message.contains("rate limit")
        || message.contains("usage limit")
    {
        "AI_CLAUDE_LIMIT_REACHED"
    } else if kind == "server_error" {
        "AI_CLAUDE_SERVICE_FAILED"
    } else {
        "AI_CLAUDE_REQUEST_FAILED"
    }
}
