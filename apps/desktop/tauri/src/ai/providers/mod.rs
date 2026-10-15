mod claude;
pub(crate) mod cli;
pub(crate) mod codex;
mod opencode;
mod opencode_catalog;
mod opencode_error;
mod process;
mod protocol;

#[cfg(test)]
#[path = "../../../test/ai_provider_tools.rs"]
mod tests;

pub(crate) fn installed() -> serde_json::Value {
    serde_json::json!({
        "codex": codex::executable().is_ok(),
        "claude": process::executable("claude").is_ok(),
        "opencode": process::executable("opencode").is_ok(),
    })
}
