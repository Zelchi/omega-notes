use serde_json::{json, Value};
use std::collections::BTreeSet;

pub(super) fn is_v2(version: &str) -> bool {
    version.split_whitespace().any(|part| {
        let part = part.strip_prefix('v').unwrap_or(part);
        let mut components = part.split('.');
        components.next() == Some("2")
            && components
                .next()
                .is_some_and(|minor| minor.parse::<u32>().is_ok())
            && components.next().is_some_and(|patch| {
                patch
                    .split(['-', '+'])
                    .next()
                    .is_some_and(|patch| patch.parse::<u32>().is_ok())
            })
    })
}

/// Go models and paid Zen models; Big Pickle has no `-free` suffix.
pub(super) fn supported_model(id: &str) -> bool {
    id.split_once('/').is_some_and(|(provider, model)| {
        !model.is_empty()
            && !id
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
            && (provider == "opencode-go"
                || (provider == "opencode" && !model.ends_with("-free") && model != "big-pickle"))
    })
}

/// V2's `models` command prints one provider/model identifier per line.
pub(super) fn models(output: &str) -> Result<Value, String> {
    let unique: BTreeSet<_> = output
        .lines()
        .map(str::trim)
        .filter(|line| supported_model(line))
        .collect();
    if unique.is_empty() {
        return Err("AI_OPENCODE_MODELS_UNAVAILABLE".into());
    }
    Ok(json!(unique
        .into_iter()
        .map(|id| json!({
            "id":id,"name":id,"isDefault":false,"defaultEffort":"","efforts":[],"serviceTiers":[]
        }))
        .collect::<Vec<_>>()))
}
