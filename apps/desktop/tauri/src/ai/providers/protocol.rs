use super::super::repository::Provider;
use super::{claude, opencode_error};
use serde_json::{json, Value};

#[derive(Default)]
pub(super) struct Stream {
    message_id: String,
    pub session_id: Option<String>,
    pub failed: bool,
    pub answered: bool,
    pub error_code: Option<&'static str>,
    pub error_detail: Option<String>,
    model_is_go: bool,
}

impl Stream {
    pub(super) fn for_model(model: Option<&str>) -> Self {
        Self {
            model_is_go: model.is_some_and(|model| model.starts_with("opencode-go/")),
            ..Self::default()
        }
    }
    pub(super) fn receive(&mut self, provider: Provider, value: &Value) -> Option<Value> {
        if provider == Provider::Opencode {
            if let Some(id) = value["sessionID"].as_str() {
                self.session_id = Some(id.into());
            }
            match value["type"].as_str()? {
                "text" => {
                    let text = value["part"]["text"].as_str()?;
                    self.answered |= !text.is_empty();
                    Some(
                        json!({"kind":"delta","itemId":value["part"]["id"].as_str().unwrap_or("answer"),"text":text}),
                    )
                }
                "error" => {
                    self.failed = true;
                    self.error_detail = value["error"]["message"]
                        .as_str()
                        .map(|message| message.chars().take(2000).collect());
                    self.error_code =
                        Some(opencode_error::classify(&value["error"], self.model_is_go));
                    None
                }
                _ => None,
            }
        } else {
            match value["type"].as_str()? {
                "system" if value["subtype"] == "init" => {
                    let unavailable = value["mcp_servers"].as_array().is_some_and(|servers| {
                        servers.iter().any(|server| {
                            server["name"] == "omega"
                                && matches!(
                                    server["status"].as_str(),
                                    Some("failed" | "needs-auth" | "disabled")
                                )
                        })
                    });
                    if unavailable {
                        self.failed = true;
                        self.error_code = Some("AI_CLAUDE_MCP_FAILED");
                    }
                    None
                }
                "stream_event" => {
                    if !value["parent_tool_use_id"].is_null() {
                        return None;
                    }
                    let event = &value["event"];
                    if event["type"] == "message_start" {
                        self.message_id =
                            event["message"]["id"].as_str().unwrap_or("answer").into();
                    }
                    if event["delta"]["type"] != "text_delta" {
                        return None;
                    }
                    let text = event["delta"]["text"].as_str()?;
                    self.answered |= !text.is_empty();
                    Some(
                        json!({"kind":"delta","itemId":format!("{}:{}", self.message_id, event["index"].as_u64().unwrap_or(0)),"text":text}),
                    )
                }
                "assistant" if value["parent_tool_use_id"].is_null() => {
                    if let Some(error) = value["error"].as_str() {
                        let detail = value["message"]["content"]
                            .as_array()
                            .map(|blocks| {
                                blocks
                                    .iter()
                                    .filter_map(|block| block["text"].as_str())
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            })
                            .unwrap_or_else(|| error.into());
                        self.failed = true;
                        self.error_code = Some(claude::error_code(error, &detail));
                        self.error_detail = Some(detail.chars().take(2000).collect());
                        return None;
                    }
                    // Final blocks replace the corresponding deltas instead of duplicating them.
                    let content = value["message"]["content"].as_array()?;
                    let id = value["message"]["id"].as_str().unwrap_or("answer");
                    let blocks: Vec<_> = content.iter().enumerate().filter_map(|(index, block)| {
                        if block["type"] != "text" { return None; }
                        let text = block["text"].as_str()?;
                        self.answered |= !text.is_empty();
                        Some(json!({"kind":"message","itemId":format!("{id}:{index}"),"text":text}))
                    }).collect();
                    Some(json!({"blocks":blocks}))
                }
                "result" => {
                    self.failed |= value["is_error"] == true;
                    if value["is_error"] == true {
                        if self.error_code.is_none() {
                            let detail = value["errors"]
                                .as_array()
                                .map(|errors| {
                                    errors
                                        .iter()
                                        .filter_map(Value::as_str)
                                        .collect::<Vec<_>>()
                                        .join("\n")
                                })
                                .filter(|detail| !detail.is_empty())
                                .or_else(|| value["result"].as_str().map(String::from))
                                .unwrap_or_else(|| {
                                    value["subtype"].as_str().unwrap_or("Request failed").into()
                                });
                            self.error_code = Some(claude::error_code(
                                value["subtype"].as_str().unwrap_or(""),
                                &detail,
                            ));
                            self.error_detail = Some(detail.chars().take(2000).collect());
                        }
                        return None;
                    }
                    if self.answered || self.failed {
                        return None;
                    }
                    let text = value["result"].as_str()?;
                    self.answered = !text.is_empty();
                    Some(json!({"kind":"message","itemId":"answer","text":text}))
                }
                _ => None,
            }
        }
    }
}
