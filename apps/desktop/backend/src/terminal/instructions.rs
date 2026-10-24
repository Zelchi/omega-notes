use std::{fs, io::Write, path::Path};

const START: &str = "<!-- omega-notes:gambiarra:start -->";
const END: &str = "<!-- omega-notes:gambiarra:end -->";

fn update(root: &Path, name: &str, body: &str, enabled: bool) -> Result<(), String> {
    let path = root.join(name);
    let original = match fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() && meta.len() <= 2_000_000 => {
            Some(fs::read_to_string(&path).map_err(|_| "TERMINAL_INSTRUCTIONS_FAILED")?)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        _ => return Err("TERMINAL_INSTRUCTIONS_FAILED".into()),
    };
    let contents = original.as_deref().unwrap_or("");
    let managed = match (contents.find(START), contents.find(END)) {
        (Some(start), Some(end))
            if end >= start
                && !contents[start + START.len()..].contains(START)
                && !contents[end + END.len()..].contains(END) =>
        {
            Some(start..end + END.len())
        }
        (None, None) => None,
        _ => return Err("TERMINAL_INSTRUCTIONS_FAILED".into()),
    };
    let block = if enabled {
        format!("{START}\n{body}\n{END}")
    } else {
        String::new()
    };
    let mut next = contents.to_string();
    if let Some(mut range) = managed {
        if !enabled && contents[range.end..].starts_with('\n') {
            range.end += 1;
        }
        next.replace_range(range, &block);
    } else if enabled {
        next = if contents.is_empty() {
            block
        } else {
            format!("{block}\n{contents}")
        };
    }
    if next == contents {
        return Ok(());
    }
    if next.is_empty() {
        fs::remove_file(&path).map_err(|_| "TERMINAL_INSTRUCTIONS_FAILED".to_string())
    } else if original.is_none() {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .and_then(|mut file| file.write_all(next.as_bytes()))
            .map_err(|_| "TERMINAL_INSTRUCTIONS_FAILED".to_string())
    } else {
        crate::storage::atomic_write(&path, next.as_bytes(), None)
    }
}

pub(super) fn sync(root: &Path, enabled: bool) -> Result<(), String> {
    if !enabled {
        let hooks = super::hooks::sync(root, None);
        let agents = update(root, "AGENTS.md", "", false);
        return hooks.and(agents);
    }
    update(root, "AGENTS.md", include_str!("vault-manual.md"), true)
}
