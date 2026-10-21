use crate::ai::tools;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};

struct Vault {
    root: PathBuf,
    directory: PathBuf,
    id: String,
}
impl Vault {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("omega-mcp-test-{}", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        let directory = root.join("vaults").join(&id).join("notes");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            root.join("vaults.json"),
            json!({"version":1,"activeVaultId":id,"vaults":[{"id":id,"name":"Test"}]}).to_string(),
        )
        .unwrap();
        Self {
            root,
            directory,
            id,
        }
    }
    fn note(&self, number: u128, title: &str, text: &str) -> String {
        let id = uuid::Uuid::from_u128(number).to_string();
        let mut document = crate::notes::empty_document();
        if let crate::notes::NoteElement::Text { text: content, .. } = &mut document.elements[0] {
            *content = text.into();
        }
        fs::write(
            self.directory.join(format!("{id}.omega")),
            json!({"format":"omega-page","version":2,"id":id,"title":title,"document":document})
                .to_string(),
        )
        .unwrap();
        id
    }
    fn call(&self, name: &str, args: Value) -> Value {
        tools::call(&self.directory, name, &args).unwrap()
    }
    fn rpc(&self, name: &str, args: Value) -> Value {
        let response = super::reply(&self.root,&self.id,json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}})).unwrap();
        assert_ne!(response["result"]["isError"], true, "{response}");
        serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap()).unwrap()
    }
}
impl Drop for Vault {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn catalog_has_all_tools_and_correct_mcp_annotations() {
    let vault = Vault::new();
    let response = super::reply(
        &vault.root,
        &vault.id,
        json!({"id":2,"method":"tools/list"}),
    )
    .unwrap();
    let list = response["result"]["tools"].as_array().unwrap();
    assert_eq!(list.len(), 13);
    for tool in list {
        assert_ne!(tool["name"], "read_study_context");
        assert!(!tool["description"].as_str().unwrap().is_empty());
        assert_eq!(
            tool["annotations"]["readOnlyHint"],
            tool["name"] != "link_note_mentions"
        );
        assert_eq!(tool["annotations"]["openWorldHint"], false);
    }
    let names = tools::names();
    for name in [
        "read_notes",
        "get_vault_overview",
        "get_note_outline",
        "read_note_section",
        "find_unresolved_links",
        "find_connection_path",
    ] {
        assert!(names.iter().any(|item| item == name));
    }
}

#[test]
fn all_tools_work_through_mcp_dispatch() {
    let vault = Vault::new();
    let b = vault.note(2, "Beta", "# Heading\nText");
    let a = vault.note(1, "Alpha", &format!("# Start\n[[{b}|alias]] [[Missing]]"));
    for (tool, args) in [
        ("list_notes", json!({})),
        ("search_notes", json!({"query":"Text"})),
        ("read_note", json!({"noteId":a})),
        ("read_notes", json!({"noteIds":[a,b]})),
        ("list_note_connections", json!({"noteId":a})),
        ("get_vault_overview", json!({})),
        ("get_note_outline", json!({"noteId":b})),
        ("read_note_section", json!({"noteId":b,"sectionId":1})),
        ("find_unresolved_links", json!({})),
        ("find_connection_path", json!({"sourceId":a,"targetId":b})),
    ] {
        assert!(vault.rpc(tool, args).is_object(), "{tool}");
    }
}

#[test]
fn read_batch_keeps_successes_and_bounds_unicode_pages() {
    let vault = Vault::new();
    let a = vault.note(1, "Árvore", "🌱ação🌳fim");
    let result = vault.call(
        "read_notes",
        json!({"noteIds":[a,"not-an-id"],"offset":1,"limit":4}),
    );
    assert_eq!(result["notes"][0]["text"], "ação");
    assert_eq!(result["notes"][0]["nextOffset"], 5);
    assert_eq!(result["errors"].as_array().unwrap().len(), 1);
    assert!(tools::call(
        &vault.directory,
        "read_note",
        &json!({"noteId":a,"offset":999})
    )
    .is_err());
    let long = vault.note(2, "Long", &"á".repeat(5000));
    assert_eq!(
        vault.call("read_notes", json!({"noteIds":[long]}))["notes"][0]["text"]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        4000
    );
}

#[test]
fn invalid_arguments_and_unknown_tools_are_rejected() {
    let vault = Vault::new();
    let a = vault.note(1, "A", "");
    let cases = [
        ("read_note", json!({})),
        ("read_note", json!({"noteId":a,"offset":-1})),
        ("read_note", json!({"noteId":a,"limit":0})),
        ("read_note", json!({"noteId":a,"limit":16001})),
        ("list_notes", json!({"offset":1.5})),
        ("list_notes", json!({"filePath":"/etc/passwd"})),
        ("read_notes", json!({"noteIds":[]})),
        ("read_notes", json!({"noteIds":[a,a]})),
        ("read_notes", json!({"noteIds":[1]})),
        (
            "read_notes",
            json!({"noteIds":["1","2","3","4","5","6","7","8","9"]}),
        ),
        (
            "list_note_connections",
            json!({"noteId":a,"direction":"sideways"}),
        ),
        (
            "find_connection_path",
            json!({"sourceId":a,"targetId":a,"maxDepth":33}),
        ),
        ("get_vault_overview", json!({"vaultId":"other"})),
    ];
    for (tool, args) in cases {
        assert!(
            tools::call(&vault.directory, tool, &args).is_err(),
            "{tool}: {args}"
        );
    }
    assert!(tools::call(&vault.directory, "search_notes", &json!({"query":"  "})).is_err());
    assert!(tools::call(&vault.directory, "unknown", &json!({})).is_err());
}

#[test]
fn search_results_omit_text_excerpts_and_keep_unicode_match_offsets() {
    let vault = Vault::new();
    let text = format!("İ🌳{}mAgIc suffix", "á".repeat(1500));
    vault.note(1, "Unrelated", &text);
    let result = vault.call("search_notes", json!({"query":"MAGIC"}));
    let result = &result["notes"][0];
    assert_eq!(result["matchOffset"], 1502);
    assert!(result.get("snippet").is_none());
    assert!(result.get("snippetOffset").is_none());
}

#[test]
fn search_and_listing_paginate_stably() {
    let vault = Vault::new();
    for n in 1..=105 {
        vault.note(n, &format!("Note {n}"), "needle");
    }
    assert_eq!(vault.call("list_notes", json!({}))["nextOffset"], 100);
    assert_eq!(
        vault.call("list_notes", json!({"offset":100}))["notes"]
            .as_array()
            .unwrap()
            .len(),
        5
    );
    let first = vault.call("search_notes", json!({"query":"needle"}));
    let second = vault.call("search_notes", json!({"query":"needle","offset":20}));
    assert_eq!(first["nextOffset"], 20);
    assert_ne!(first["notes"][0]["id"], second["notes"][0]["id"]);
}

#[test]
fn outline_and_sections_keep_hierarchy_duplicates_and_ignore_code() {
    let vault = Vault::new();
    let id = vault.note(
        1,
        "Outline",
        "Introdução 🌳\n# One\nA\n## Child\nB\n```rust\n# Fake\n```\n# One\nLast\n###### Six\nEnd",
    );
    let outline = vault.call("get_note_outline", json!({"noteId":id}));
    assert_eq!(outline["total"], 4);
    assert_eq!(outline["headings"][3]["level"], 6);
    assert_eq!(
        outline["headings"][0]["title"],
        outline["headings"][2]["title"]
    );
    let one = vault.call("read_note_section", json!({"noteId":id,"sectionId":1}));
    assert!(one["text"].as_str().unwrap().contains("## Child"));
    assert!(!one["text"].as_str().unwrap().contains("Last"));
    assert_eq!(
        vault.call("read_note_section", json!({"noteId":id,"sectionId":0}))["text"],
        "Introdução 🌳\n"
    );
    assert_eq!(
        vault.call(
            "read_note_section",
            json!({"noteId":id,"sectionId":3,"limit":5})
        )["nextOffset"],
        5
    );
    assert!(tools::call(
        &vault.directory,
        "read_note_section",
        &json!({"noteId":id,"sectionId":99})
    )
    .is_err());
}

#[test]
fn headings_empty_notes_and_outline_pagination() {
    let vault = Vault::new();
    let empty = vault.note(1, "Empty", "");
    assert_eq!(
        vault.call("get_note_outline", json!({"noteId":empty}))["total"],
        0
    );
    assert!(tools::call(
        &vault.directory,
        "read_note_section",
        &json!({"noteId":empty,"sectionId":0})
    )
    .is_err());
    let contents = (0..105)
        .map(|n| format!("# Heading {n}\ntext\n"))
        .collect::<String>();
    let long = vault.note(2, "Long", &contents);
    assert_eq!(
        vault.call("get_note_outline", json!({"noteId":long}))["nextOffset"],
        100
    );
    assert_eq!(
        vault.call("get_note_outline", json!({"noteId":long,"offset":100}))["headings"][0]
            ["sectionId"],
        101
    );
}

#[test]
fn graph_connections_and_overview_use_ids_aliases_and_ignore_code_and_self_links() {
    let vault = Vault::new();
    let b = vault.note(2, "Béta", "[[Alpha]]");
    let a=vault.note(1,"Alpha",&format!("[[{b}|alias]] [[beta]] [[Missing]] [[missing|x]] [[Alpha]] `[[Ghost]]`\n```\n[[Fake]]\n```"));
    vault.note(3, "Isolated", "");
    let result = vault.call("list_note_connections", json!({"noteId":a}));
    assert_eq!(result["total"], 1);
    assert_eq!(result["connections"][0]["incoming"], true);
    assert_eq!(result["connections"][0]["outgoing"], true);
    let overview = vault.call("get_vault_overview", json!({}));
    assert_eq!(overview["noteCount"], 3);
    assert_eq!(overview["connectionCount"], 1);
    assert_eq!(overview["directedReferences"], 2);
    assert_eq!(overview["isolatedNoteCount"], 1);
    assert_eq!(overview["unresolvedLinkCount"], 1);
    let missing = vault.call("find_unresolved_links", json!({"noteId":a}));
    assert_eq!(missing["total"], 1);
    assert_eq!(missing["links"][0]["target"], "Missing");
}

#[test]
fn shortest_paths_follow_direction_handle_cycles_and_report_depth_limits() {
    let vault = Vault::new();
    let c = vault.note(3, "C", "");
    let b = vault.note(2, "B", &format!("[[{c}]]"));
    let a = vault.note(1, "A", &format!("[[{b}]]"));
    let d = vault.note(4, "D", "[[A]]");
    let isolated = vault.note(5, "Alone", "");
    assert_eq!(
        vault.call("find_connection_path", json!({"sourceId":a,"targetId":c}))["distance"],
        2
    );
    assert_eq!(
        vault.call(
            "find_connection_path",
            json!({"sourceId":a,"targetId":c,"maxDepth":1})
        )["depthLimited"],
        true
    );
    assert_eq!(
        vault.call(
            "find_connection_path",
            json!({"sourceId":c,"targetId":a,"direction":"outgoing"})
        )["found"],
        false
    );
    assert_eq!(
        vault.call("find_connection_path", json!({"sourceId":c,"targetId":d}))["distance"],
        3
    );
    assert_eq!(
        vault.call("find_connection_path", json!({"sourceId":a,"targetId":a}))["distance"],
        0
    );
    assert_eq!(
        vault.call(
            "find_connection_path",
            json!({"sourceId":a,"targetId":isolated})
        )["found"],
        false
    );
    vault.note(3, "C", "[[A]]");
    assert_eq!(
        vault.call(
            "find_connection_path",
            json!({"sourceId":a,"targetId":isolated})
        )["found"],
        false
    );
}

#[test]
fn unresolved_links_paginate_and_keep_sources() {
    let vault = Vault::new();
    let a = vault.note(
        1,
        "A",
        &(0..105)
            .map(|n| format!("[[Missing{n:03}]] "))
            .collect::<String>(),
    );
    let b = vault.note(2, "B", "[[Other]]");
    let result = vault.call("find_unresolved_links", json!({"noteId":a}));
    assert_eq!(result["total"], 105);
    assert_eq!(result["nextOffset"], 100);
    assert_eq!(
        vault.call("find_unresolved_links", json!({"noteId":a,"offset":100}))["links"]
            .as_array()
            .unwrap()
            .len(),
        5
    );
    assert_eq!(
        vault.call("find_unresolved_links", json!({"noteId":b}))["total"],
        1
    );
}

#[test]
fn unreadable_notes_are_reported_and_requested_missing_notes_fail() {
    let vault = Vault::new();
    fs::write(vault.directory.join("broken.omega"), "broken").unwrap();
    vault.note(1, "A", "");
    for (tool, args) in [
        ("get_vault_overview", json!({})),
        ("list_notes", json!({})),
        ("find_unresolved_links", json!({})),
    ] {
        assert_eq!(vault.call(tool, args)["unreadableNotes"], 1);
    }
    assert!(tools::call(
        &vault.directory,
        "read_note",
        &json!({"noteId":uuid::Uuid::new_v4().to_string()})
    )
    .is_err());
}

#[test]
fn vault_boundary_rejects_other_vault_and_active_vault_changes() {
    let vault = Vault::new();
    let other = Vault::new();
    let secret = other.note(1, "Secret", "secret");
    assert_eq!(vault.call("list_notes", json!({}))["total"], 0);
    assert!(tools::call(&vault.directory, "read_note", &json!({"noteId":secret})).is_err());
    assert!(tools::resolve_vault_in(&vault.root, &other.id).is_err());
    fs::write(
        vault.root.join("vaults.json"),
        json!({"version":1,"activeVaultId":null,"vaults":[]}).to_string(),
    )
    .unwrap();
    let response = super::reply(
        &vault.root,
        &vault.id,
        json!({"id":1,"method":"tools/call","params":{"name":"get_vault_overview","arguments":{}}}),
    )
    .unwrap();
    assert_eq!(response["result"]["isError"], true);
}

#[cfg(unix)]
#[test]
fn symbolic_links_cannot_read_another_vault() {
    let vault = Vault::new();
    let other = Vault::new();
    let secret = other.note(1, "Secret", "secret");
    std::os::unix::fs::symlink(
        other.directory.join(format!("{secret}.omega")),
        vault.directory.join(format!("{secret}.omega")),
    )
    .unwrap();
    assert!(tools::call(&vault.directory, "read_note", &json!({"noteId":secret})).is_err());
    assert_eq!(
        vault.call("get_vault_overview", json!({}))["unreadableNotes"],
        1
    );
    assert_eq!(vault.call("list_notes", json!({}))["total"], 0);
}

#[test]
fn connection_directions_paginate_and_ids_survive_renaming() {
    let vault = Vault::new();
    let c = vault.note(3, "C", "");
    let b = vault.note(2, "B", &format!("[[{c}]]"));
    let a = vault.note(1, "A", &format!("[[{b}]]"));
    let incoming = vault.call(
        "list_note_connections",
        json!({"noteId":b,"direction":"incoming"}),
    );
    assert_eq!(incoming["total"], 1);
    assert_eq!(incoming["connections"][0]["id"], a);
    assert_eq!(incoming["connections"][0]["outgoing"], false);
    let outgoing = vault.call(
        "list_note_connections",
        json!({"noteId":b,"direction":"outgoing"}),
    );
    assert_eq!(outgoing["connections"][0]["id"], c);
    assert_eq!(outgoing["connections"][0]["incoming"], false);
    vault.note(3, "Renamed", "");
    assert_eq!(
        vault.call("list_note_connections", json!({"noteId":b}))["connections"][1]["title"],
        "Renamed"
    );
    let contents = (10..115)
        .map(|number| {
            let id = vault.note(number, "Target", "");
            format!("[[{id}]]")
        })
        .collect::<String>();
    vault.note(2, "B", &contents);
    assert_eq!(
        vault.call(
            "list_note_connections",
            json!({"noteId":b,"direction":"outgoing"})
        )["nextOffset"],
        100
    );
    assert_eq!(
        vault.call(
            "list_note_connections",
            json!({"noteId":b,"direction":"outgoing","offset":100})
        )["connections"]
            .as_array()
            .unwrap()
            .len(),
        5
    );
}

#[test]
fn queries_do_not_change_note_files() {
    let vault = Vault::new();
    let b = vault.note(2, "B", "# Header\nBody");
    let a = vault.note(1, "A", "[[B]] [[Missing]]");
    let before: Vec<_> = fs::read_dir(&vault.directory)
        .unwrap()
        .map(|entry| {
            let path = entry.unwrap().path();
            let bytes = fs::read(&path).unwrap();
            (path, bytes)
        })
        .collect();
    for (tool, args) in [
        ("list_notes", json!({})),
        ("search_notes", json!({"query":"Body"})),
        ("read_note", json!({"noteId":a})),
        ("read_notes", json!({"noteIds":[a,b]})),
        ("list_note_connections", json!({"noteId":a})),
        ("get_vault_overview", json!({})),
        ("get_note_outline", json!({"noteId":b})),
        ("read_note_section", json!({"noteId":b,"sectionId":1})),
        ("find_unresolved_links", json!({})),
        ("find_connection_path", json!({"sourceId":a,"targetId":b})),
    ] {
        vault.rpc(tool, args);
    }
    for (path, bytes) in before {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    let note_file_count = fs::read_dir(&vault.directory)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "omega")
        })
        .count();
    assert_eq!(note_file_count, 2);
}

#[cfg(unix)]
#[test]
fn symbolic_vault_parent_is_rejected() {
    let vault = Vault::new();
    let other = Vault::new();
    fs::create_dir_all(other.root.join("vaults").join(&vault.id).join("notes")).unwrap();
    fs::rename(
        vault.root.join("vaults"),
        vault.root.join("original-vaults"),
    )
    .unwrap();
    std::os::unix::fs::symlink(other.root.join("vaults"), vault.root.join("vaults")).unwrap();
    assert!(tools::resolve_vault_in(&vault.root, &vault.id).is_err());
}

#[test]
fn long_outline_labels_and_missing_targets_are_bounded() {
    let vault = Vault::new();
    let title = "á".repeat(1500);
    let target = "🌳".repeat(1500);
    let id = vault.note(1, "A", &format!("# {title}\n[[{target}]]"));
    let outline = vault.call("get_note_outline", json!({"noteId":id}));
    assert_eq!(
        outline["headings"][0]["title"]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        600
    );
    assert_eq!(outline["headings"][0]["titleTruncated"], true);
    let missing = vault.call("find_unresolved_links", json!({}));
    assert_eq!(
        missing["links"][0]["target"]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        600
    );
    assert_eq!(missing["links"][0]["targetTruncated"], true);
}

#[test]
fn note_results_include_ready_to_copy_clickable_references() {
    let vault = Vault::new();
    let b = vault.note(2, "Teste 2", "# Heading\nText");
    let a = vault.note(1, "Teste 1", &format!("[[{b}]] [[Missing]]"));
    let reference = format!("[[{a}]]");
    assert_eq!(
        vault.call("list_notes", json!({}))["notes"][0]["reference"],
        reference
    );
    assert_eq!(
        vault.call("search_notes", json!({"query":"Teste 1"}))["notes"][0]["reference"],
        reference
    );
    assert_eq!(
        vault.call("read_note", json!({"noteId":a}))["reference"],
        reference
    );
    assert_eq!(
        vault.call("read_notes", json!({"noteIds":[a]}))["notes"][0]["reference"],
        reference
    );
    assert_eq!(
        vault.call("get_note_outline", json!({"noteId":a}))["reference"],
        reference
    );
    assert_eq!(
        vault.call("read_note_section", json!({"noteId":a,"sectionId":0}))["reference"],
        reference
    );
    assert_eq!(
        vault.call("list_note_connections", json!({"noteId":a}))["connections"][0]["reference"],
        format!("[[{b}]]")
    );
    assert_eq!(
        vault.call("find_connection_path", json!({"sourceId":a,"targetId":b}))["path"][0]
            ["reference"],
        reference
    );
    assert_eq!(
        vault.call("find_unresolved_links", json!({"noteId":a}))["links"][0]["sourceReference"],
        reference
    );
    let instructions = crate::ai::instructions::VAULT_INSTRUCTIONS;
    assert!(instructions.contains("Every conversational mention"));
    assert!(instructions.contains("short confirmations"));
    assert!(instructions.contains("plain or bold note title"));
    for tool in tools::definitions().as_array().unwrap() {
        assert!(tool["description"]
            .as_str()
            .unwrap()
            .contains("clickable [[id]] link"));
    }
}
