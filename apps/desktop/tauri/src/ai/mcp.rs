use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};
use std::path::Path;

use super::tools;

pub(crate) fn run_if_requested() -> bool {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_none_or(|arg| arg != "--ai-mcp") {
        return false;
    }
    if args.len() != 4 && args.len() != 6 {
        return true;
    }
    let directory = Path::new(&args[2]);
    let Some(vault_id) = args[3].to_str() else {
        return true;
    };
    let bridge = args
        .get(4)
        .and_then(|port| port.to_str())
        .zip(args.get(5).and_then(|token| token.to_str()));
    if tools::resolve_vault_in(directory, vault_id).is_err() {
        return true;
    }
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    loop {
        let mut line = String::new();
        if !matches!((&mut input).take(1024 * 1024).read_line(&mut line), Ok(size) if size > 0)
            || !line.ends_with('\n')
        {
            break;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(message) => reply_with_bridge(directory, vault_id, message, bridge),
            Err(_) => Some(
                json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Invalid JSON"}}),
            ),
        };
        if let Some(response) = response {
            if writeln!(output, "{response}")
                .and_then(|_| output.flush())
                .is_err()
            {
                break;
            }
        }
    }
    true
}

#[cfg(test)]
fn reply(directory: &Path, vault_id: &str, message: Value) -> Option<Value> {
    reply_with_bridge(directory, vault_id, message, None)
}

fn reply_with_bridge(
    directory: &Path,
    vault_id: &str,
    message: Value,
    bridge: Option<(&str, &str)>,
) -> Option<Value> {
    let id = message.get("id")?;
    let params = &message["params"];
    let result = match message["method"].as_str().unwrap_or("") {
        "initialize" => json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},
            "serverInfo":{"name":"omega-notes","version":env!("CARGO_PKG_VERSION")}}),
        "ping" => json!({}),
        "tools/list" => {
            let definitions = tools::definitions();
            let definitions: Vec<_> = definitions.as_array()?.iter().map(|tool|
                json!({"name":tool["name"],"description":tool["description"],"inputSchema":tool["inputSchema"],
                    "annotations":{"readOnlyHint":!tools::is_mutation(tool["name"].as_str().unwrap_or_default()),"destructiveHint":false,"openWorldHint":false}})).collect();
            json!({"tools":definitions})
        }
        "tools/call" => {
            let result = tools::resolve_vault_in(directory, vault_id).and_then(|notes| {
                if tools::is_mutation(params["name"].as_str().unwrap_or_default()) {
                    let (port, token) = bridge.ok_or("AI_LINK_BRIDGE_REQUIRED")?;
                    return super::link_requests::forward(port, token, &params["arguments"]);
                }
                tools::call(
                    &notes,
                    params["name"].as_str().unwrap_or(""),
                    &params["arguments"],
                )
            });
            match result {
                Ok(value) => json!({"content":[{"type":"text","text":value.to_string()}]}),
                Err(error) => json!({"isError":true,"content":[{"type":"text","text":error}]}),
            }
        }
        _ => {
            return Some(
                json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Unknown method"}}),
            )
        }
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

#[cfg(test)]
#[path = "../../test/ai_tools.rs"]
mod tests;
