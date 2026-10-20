use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
const KEY: &str = "omega-notes-session";

pub(crate) fn hook_command(arguments: &[String]) -> Result<String, String> {
    let invocation = shell_invocation(arguments)?;
    #[cfg(windows)]
    let invocation = format!("chcp 65001 >nul 2>nul & {invocation}");
    Ok(invocation)
}

pub(crate) fn shell_invocation(arguments: &[String]) -> Result<String, String> {
    arguments
        .iter()
        .map(|value| {
            if value.chars().any(char::is_control) {
                return Err("TERMINAL_FAILED".into());
            }
            #[cfg(windows)]
            {
                if value.contains(['"', '%', '!']) {
                    return Err("TERMINAL_FAILED".into());
                }
                Ok(format!("\"{value}\""))
            }
            #[cfg(not(windows))]
            {
                Ok(format!("'{}'", value.replace('\'', "'\\''")))
            }
        })
        .collect::<Result<Vec<_>, String>>()
        .map(|parts| parts.join(" "))
}

pub(super) fn sync(root: &Path, binding: Option<(&Path, &str, &str)>) -> Result<(), String> {
    let folder = root.join(".agents");
    match fs::symlink_metadata(&folder) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if binding.is_none() {
                return Ok(());
            }
            fs::create_dir(&folder).map_err(|_| "TERMINAL_FAILED")?;
        }
        _ => return Err("TERMINAL_FAILED".into()),
    }
    let path = folder.join("hooks.json");
    let mut hooks = match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => json!({}),
        Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() && meta.len() <= 1_048_576 => {
            let data = fs::read(&path).map_err(|_| "TERMINAL_FAILED")?;
            serde_json::from_slice::<Value>(&data).map_err(|_| "TERMINAL_FAILED")?
        }
        _ => return Err("TERMINAL_FAILED".into()),
    };
    let map = hooks.as_object_mut().ok_or("TERMINAL_FAILED")?;
    if let Some(previous) = map.get(KEY) {
        if !previous["SessionStart"][0]["command"]
            .as_str()
            .is_some_and(|command| command.contains("--omega-agy-record"))
        {
            return Err("TERMINAL_FAILED".into());
        }
    }
    if let Some((directory, vault, run_id)) = binding {
        let binary = std::env::current_exe().map_err(|_| "TERMINAL_FAILED")?;
        let command = hook_command(&[
            binary.to_string_lossy().into_owned(),
            "--omega-agy-record".into(),
            directory.to_string_lossy().into_owned(),
            vault.into(),
            run_id.into(),
        ])?;
        map.insert(
            KEY.into(),
            json!({
                "SessionStart":[{"type":"command","command":command,"timeout":10}],
                "PreInvocation":[{"type":"command","command":command,"timeout":10}]
            }),
        );
    } else if map.remove(KEY).is_none() {
        return Ok(());
    }
    if map.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|_| "TERMINAL_FAILED")?;
        }
        Ok(())
    } else {
        crate::storage::atomic_write(
            &path,
            &serde_json::to_vec_pretty(&hooks).map_err(|_| "TERMINAL_FAILED")?,
            None,
        )
    }
}

fn record(directory: &Path, vault_id: &str, run_id: &str, input: &Value) -> Result<(), String> {
    uuid::Uuid::parse_str(vault_id).map_err(|_| "TERMINAL_FAILED")?;
    uuid::Uuid::parse_str(run_id).map_err(|_| "TERMINAL_FAILED")?;
    let id = input["conversationId"].as_str().ok_or("TERMINAL_FAILED")?;
    uuid::Uuid::parse_str(id).map_err(|_| "TERMINAL_FAILED")?;
    if input["parentConversationId"]
        .as_str()
        .is_some_and(|parent| !parent.is_empty())
        || input["rootConversationId"]
            .as_str()
            .is_some_and(|root| !root.is_empty() && root != id)
    {
        return Ok(());
    }
    let registry = crate::vaults::read_vault_registry(directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or("TERMINAL_FAILED")?;
    let root = crate::vaults::vault_directory(directory, vault)?
        .canonicalize()
        .map_err(|_| "TERMINAL_FAILED")?;
    if !input["workspacePaths"].as_array().is_some_and(|paths| {
        paths.iter().any(|path| {
            path.as_str()
                .and_then(|path| Path::new(path).canonicalize().ok())
                .as_ref()
                == Some(&root)
        })
    }) {
        return Err("TERMINAL_FAILED".into());
    }
    super::conversations::record_antigravity(directory, vault_id, &root, id, run_id)
}

pub(crate) fn run_if_requested() -> bool {
    let args: Vec<_> = std::env::args_os().collect();
    let Some(mode) = args.get(1).and_then(|value| value.to_str()) else {
        return false;
    };
    if !matches!(mode, "--omega-agy-guard" | "--omega-agy-record") {
        return false;
    }
    let input = (|| -> Option<Value> {
        let mut data = Vec::new();
        std::io::stdin().take(65_537).read_to_end(&mut data).ok()?;
        if data.len() > 65_536 {
            return None;
        }
        serde_json::from_slice(&data).ok()
    })();
    let output = if mode == "--omega-agy-guard" {
        let purpose = args
            .get(2)
            .and_then(|value| value.to_str())
            .and_then(|value| {
                serde_json::from_value::<crate::ai::task::Purpose>(json!(value)).ok()
            });
        let name = input
            .as_ref()
            .and_then(|value| value["toolCall"]["name"].as_str())
            .unwrap_or("");
        let name = name
            .strip_prefix("mcp__omega__")
            .or_else(|| name.strip_prefix("mcp_omega_"))
            .or_else(|| name.strip_prefix("omega/"))
            .unwrap_or(name);
        let allowed = purpose.is_some_and(|purpose| {
            crate::ai::antigravity_tool_names()
                .iter()
                .any(|tool| tool == name)
                && crate::ai::antigravity_tool_allowed(purpose, name)
        });
        json!({"decision":if allowed {"auto_approve"} else {"deny"},"reason":if allowed {"Omega Notes scoped MCP tool"} else {"Only the Omega Notes MCP tools for this task are enabled."}})
    } else {
        let result = args
            .get(2)
            .zip(args.get(3))
            .zip(args.get(4))
            .zip(input.as_ref())
            .ok_or_else(|| "TERMINAL_FAILED".to_string())
            .and_then(|(((directory, vault), run_id), input)| {
                record(
                    &PathBuf::from(directory),
                    vault.to_str().ok_or("TERMINAL_FAILED")?,
                    run_id.to_str().ok_or("TERMINAL_FAILED")?,
                    input,
                )
            });
        if result.is_err() {
            let _ = writeln!(
                std::io::stderr(),
                "Could not record the Omega Notes CLI session."
            );
        }
        json!({})
    };
    let _ = writeln!(std::io::stdout(), "{output}");
    true
}
