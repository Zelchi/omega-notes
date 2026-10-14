use super::super::repository::Provider;
use serde_json::{json, Value};

#[derive(Default)]
pub(super) struct Stream {
    message_id: String,
    pub session_id: Option<String>,
    pub failed: bool,
    pub answered: bool,
}

impl Stream {
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
                        json!({"kind":"message","itemId":value["part"]["id"].as_str().unwrap_or("answer"),"text":text}),
                    )
                }
                "error" => {
                    self.failed = true;
                    None
                }
                _ => None,
            }
        } else {
            match value["type"].as_str()? {
                "stream_event" => {
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
