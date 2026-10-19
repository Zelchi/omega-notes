use std::process::Command;

use serde_json::json;

#[test]
fn claude_allows_every_catalog_tool_and_keeps_native_tools_disabled() {
    let mut command = Command::new("unused-claude-test-command");
    super::claude::configure(
        &mut command,
        json!({}),
        crate::ai::task::Purpose::Chat,
        None,
        None,
    );
    let args: Vec<_> = command
        .get_args()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let allowed = &args[args.iter().position(|arg| arg == "--allowedTools").unwrap() + 1];
    let allowed: Vec<_> = allowed.split(',').collect();
    let names: Vec<_> = crate::ai::tools::names()
        .into_iter()
        .filter(|name| crate::ai::tools::allowed_for(crate::ai::task::Purpose::Chat, name))
        .collect();
    assert_eq!(allowed.len(), names.len());
    for name in names {
        assert!(allowed.contains(&format!("mcp__omega__{name}").as_str()));
    }
    assert_eq!(
        args[args.iter().position(|arg| arg == "--tools").unwrap() + 1],
        ""
    );
    assert!(args.iter().any(|arg| arg == "--strict-mcp-config"));
}

#[test]
fn opencode_denies_other_tools_and_allows_every_catalog_tool() {
    let permissions = super::opencode::permissions();
    let permissions = permissions.as_array().unwrap();
    assert_eq!(
        permissions[0],
        json!({"action":"*","resource":"*","effect":"deny"})
    );
    let names = crate::ai::tools::names();
    assert_eq!(permissions.len(), names.len() + 1);
    for name in names {
        assert!(permissions.iter().skip(1).any(|rule| rule
            == &json!({"action":format!("omega_{name}"),"resource":"*","effect":"allow"})));
    }
}

#[test]
fn claude_studies_allow_only_the_prepared_context() {
    for purpose in [
        crate::ai::task::Purpose::StudyGeneration,
        crate::ai::task::Purpose::StudyEvaluation,
    ] {
        let mut command = Command::new("unused-claude-test-command");
        super::claude::configure(&mut command, json!({}), purpose, None, None);
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let value = |flag: &str| &args[args.iter().position(|arg| arg == flag).unwrap() + 1];
        assert_eq!(value("--allowedTools"), "mcp__omega__read_study_context");
        assert_eq!(value("--tools"), "");
        assert_eq!(value("--system-prompt"), purpose.instructions());
        let tools = crate::ai::tools::definitions_for(purpose);
        assert_eq!(tools.as_array().unwrap().len(), 1);
        assert_eq!(tools[0]["name"], "read_study_context");
        assert!(!crate::ai::tools::allowed_for(
            purpose,
            "link_note_mentions"
        ));
    }
}
