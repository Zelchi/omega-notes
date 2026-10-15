use super::process::{self, Executable};
use serde_json::{json, Value};
use std::{path::Path, process::Command};

fn public_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(value) if value == "***" => None,
        Value::Object(values) => Some(Value::Object(
            values
                .iter()
                .filter_map(|(key, value)| public_value(value).map(|value| (key.clone(), value)))
                .collect(),
        )),
        Value::Array(values) => Some(Value::Array(
            values.iter().filter_map(public_value).collect(),
        )),
        value => Some(value.clone()),
    }
}
fn merge(target: &mut Value, source: Value) {
    if let (Some(target), Some(source)) = (target.as_object_mut(), source.as_object()) {
        for (key, value) in source {
            merge(
                target.entry(key.clone()).or_insert(Value::Null),
                value.clone(),
            );
        }
    } else {
        *target = source;
    }
}

pub(super) fn isolate(command: &mut Command, root: &Path, config: &Value) -> Result<(), String> {
    let isolated = root.join("config");
    match std::fs::symlink_metadata(&isolated) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&isolated).map_err(|_| "AI_STORAGE_FAILED")?
        }
        _ => return Err("AI_STORAGE_FAILED".into()),
    }
    command
        .current_dir(root)
        .env("PWD", root)
        .env("OPENCODE_CONFIG_CONTENT", config.to_string())
        .env_remove("OPENCODE_CONFIG")
        .env("XDG_CONFIG_HOME", &isolated)
        .env("OPENCODE_CONFIG_DIR", &isolated)
        .env("OPENCODE_DISABLE_PROJECT_CONFIG", "1");
    Ok(())
}

pub(super) fn configure(
    command: &mut Command,
    binary: &Executable,
    root: &Path,
    mcp_command: Vec<Value>,
    instructions: &str,
    model: Option<&str>,
) -> Result<(), String> {
    let permissions = json!([
        {"action":"*","resource":"*","effect":"deny"},
        {"action":"omega_list_notes","resource":"*","effect":"allow"},
        {"action":"omega_search_notes","resource":"*","effect":"allow"},
        {"action":"omega_read_note","resource":"*","effect":"allow"}
    ]);
    let mut config = json!({"update":"disable","share":"disabled","snapshots":false,
        "plugins":[],"skills":[],"instructions":[],"references":{},"commands":{},
        "permissions":permissions,
        "default_agent":"omega",
        "agents":{"omega":{"mode":"primary","description":"Ômega Notes vault assistant",
            "system":instructions}},
        "mcp":{"servers":{"omega":{"type":"local","command":mcp_command,"codemode":false,"protocol":"legacy"}}}
    });
    let mut inspect = process::command(binary);
    inspect
        .current_dir(root)
        .env("PWD", root)
        .args(["debug", "config"]);
    let (success, documents) = process::output(inspect)?;
    if !success {
        return Err("AI_OPENCODE_CONFIG_FAILED".into());
    }
    let documents: Value =
        serde_json::from_str(&documents).map_err(|_| "AI_OPENCODE_CONFIG_FAILED")?;
    let documents = documents.as_array().ok_or("AI_OPENCODE_CONFIG_FAILED")?;
    for document in documents
        .iter()
        .filter(|document| document["type"] == "document")
    {
        for key in ["providers", "model"] {
            if let Some(value) = document["info"].get(key).and_then(public_value) {
                merge(&mut config[key], value);
            }
        }
    }
    isolate(command, root, &config)?;
    command.args([
        "run",
        "--standalone",
        "--format",
        "json",
        "--agent",
        "omega",
    ]);
    if let Some(model) = model.filter(|model| !model.is_empty()) {
        command.arg("--model").arg(model);
    }
    Ok(())
}
