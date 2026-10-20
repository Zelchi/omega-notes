mod antigravity;
mod claude;
pub(crate) mod cli;
pub(crate) mod codex;
mod opencode;
mod opencode_catalog;
mod opencode_error;
mod process;
mod protocol;
pub(crate) use antigravity::profile_directory as antigravity_profile_directory;

pub(crate) fn terminal_command(name: &str) -> Result<Vec<String>, String> {
    let binary = if name == "codex" {
        process::Executable {
            program: codex::executable()?,
            arguments: vec![],
        }
    } else {
        process::executable(name)?
    };
    std::iter::once(binary.program.into_os_string())
        .chain(binary.arguments)
        .map(|argument| {
            argument
                .into_string()
                .map_err(|_| "TERMINAL_START_FAILED".into())
        })
        .collect()
}

#[cfg(test)]
#[path = "../../../test/ai_provider_tools.rs"]
mod tests;

pub(crate) fn installed() -> serde_json::Value {
    serde_json::json!({
        "codex": codex::executable().is_ok(),
        "claude": process::executable("claude").is_ok(),
        "opencode": process::executable("opencode").is_ok(),
        "antigravity": process::executable("agy").is_ok(),
    })
}
