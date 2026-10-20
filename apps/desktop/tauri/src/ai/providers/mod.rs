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

pub(crate) fn terminal_opencode_session_id(root: &std::path::Path) -> Option<String> {
    let root = root.canonicalize().ok()?;
    let binary = process::executable("opencode").ok()?;
    let mut command = process::command(&binary);
    command
        .current_dir(&root)
        .args(["session", "list", "--max-count", "100", "--format", "json"]);
    let (success, output) =
        process::output_with_timeout(command, std::time::Duration::from_secs(5)).ok()?;
    if !success {
        return None;
    }
    let sessions: serde_json::Value = serde_json::from_str(&output).ok()?;
    let sessions = sessions.as_array()?;
    sessions
        .iter()
        .filter_map(|session| {
            let id = session["id"].as_str()?;
            if !id.starts_with("ses_")
                || id.len() > 128
                || !id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
            {
                return None;
            }
            let directory = std::path::Path::new(session["directory"].as_str()?)
                .canonicalize()
                .ok()?;
            if directory != root {
                return None;
            }
            Some((
                id.to_string(),
                session["updated"].as_i64().unwrap_or_default(),
            ))
        })
        .max_by_key(|(_, updated)| *updated)
        .map(|(id, _)| id)
}

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
