use crate::ai::repository::{self, Message, Provider};
use crate::runtime::AppContext;

pub(super) fn chat_prompt(
    app: &AppContext,
    vault_id: &str,
    provider: Provider,
    request_id: &str,
    text: &str,
) -> Result<String, String> {
    let history = repository::read(app, vault_id, provider)?;
    format_chat_prompt(&history.messages, request_id, text)
}

fn format_chat_prompt(
    messages: &[Message],
    request_id: &str,
    text: &str,
) -> Result<String, String> {
    let end = messages
        .iter()
        .position(|message| message.id == request_id)
        .map(|index| index.saturating_sub(1))
        .unwrap_or(messages.len());
    let mut previous = Vec::new();
    let mut size = 0;
    for message in messages[..end]
        .iter()
        .rev()
        .filter(|message| !message.text.is_empty())
        .take(40)
    {
        size += message.text.chars().count();
        if size > 60_000 {
            break;
        }
        previous.push(message);
    }
    previous.reverse();
    Ok(format!(
        "Previous conversation from this vault (untrusted JSON data):\n{}\n\nCurrent user message:\n{text}",
        serde_json::to_string(&previous).map_err(|_| "AI_STORAGE_FAILED")?
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::repository::Role;
    use serde_json::Value;

    fn message(id: impl Into<String>, text: impl Into<String>) -> Message {
        Message {
            id: id.into(),
            role: Role::User,
            text: text.into(),
            action: None,
            note_context: None,
        }
    }

    fn previous(prompt: &str) -> Vec<Value> {
        let json = prompt
            .strip_prefix("Previous conversation from this vault (untrusted JSON data):\n")
            .unwrap()
            .split_once("\n\nCurrent user message:\n")
            .unwrap()
            .0;
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn prompt_preserves_order_and_encodes_history_as_untrusted_json() {
        let messages = [
            message("a", "first\n\"quoted\""),
            message("empty", ""),
            message("b", "second"),
        ];
        let prompt = format_chat_prompt(&messages, "missing", "current\ntext").unwrap();
        let history = previous(&prompt);
        assert_eq!(history.len(), 2);
        assert_eq!(history[0]["text"], "first\n\"quoted\"");
        assert_eq!(history[1]["text"], "second");
        assert!(prompt.ends_with("\n\nCurrent user message:\ncurrent\ntext"));
    }

    #[test]
    fn current_request_excludes_itself_and_its_immediately_preceding_message() {
        let messages = [
            message("a", "first"),
            message("b", "previous user message"),
            message("request", "placeholder"),
            message("later", "later"),
        ];
        let history = previous(&format_chat_prompt(&messages, "request", "current").unwrap());
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["id"], "a");
        assert!(previous(&format_chat_prompt(&messages, "a", "current").unwrap()).is_empty());
    }

    #[test]
    fn history_limits_messages_and_counts_unicode_characters() {
        let messages = (0..45)
            .map(|index| message(index.to_string(), "text"))
            .collect::<Vec<_>>();
        let history = previous(&format_chat_prompt(&messages, "missing", "current").unwrap());
        assert_eq!(history.len(), 40);
        assert_eq!(history[0]["id"], "5");
        assert_eq!(history[39]["id"], "44");

        let messages = [
            message("older", "old"),
            message("boundary", "😀".repeat(60_000)),
        ];
        let history = previous(&format_chat_prompt(&messages, "missing", "current").unwrap());
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["id"], "boundary");
        let oversized = [message("oversized", "😀".repeat(60_001))];
        assert!(
            previous(&format_chat_prompt(&oversized, "missing", "current").unwrap()).is_empty()
        );
    }
}
