use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};
use std::path::Path;

use super::tools;

/// A stdio-only MCP endpoint launched by the host with one authorized vault.
pub(crate) fn run_if_requested() -> bool {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_none_or(|arg| arg != "--ai-mcp") {
        return false;
    }
    if args.len() != 4 {
        return true;
    }
    let directory = Path::new(&args[2]);
    let Some(vault_id) = args[3].to_str() else {
        return true;
    };
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
            Ok(message) => reply(directory, vault_id, message),
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

fn reply(directory: &Path, vault_id: &str, message: Value) -> Option<Value> {
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
                    "annotations":{"readOnlyHint":true,"destructiveHint":false,"openWorldHint":false}})).collect();
            json!({"tools":definitions})
        }
        "tools/call" => {
            let result = tools::resolve_vault_in(directory, vault_id).and_then(|notes| {
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
