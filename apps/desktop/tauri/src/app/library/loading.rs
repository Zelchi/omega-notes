use std::cmp::Reverse;
use std::path::PathBuf;

use crate::notes::{
    note_backup_path, note_file_exists, note_from_path, note_from_path_with_id,
    note_id_from_backup, note_path, note_paths, preserve_recovery_copy, read_file_bytes,
    restore_file, NoteLibrary, NoteLoadIssue,
};

pub(crate) fn list_notes(
    resolve_directories: &impl Fn() -> Result<(PathBuf, PathBuf), String>,
) -> Result<NoteLibrary, String> {
    let (directory, backups_directory) = resolve_directories()?;
    crate::notes::recover_note_rename_journal(&directory, &backups_directory)?;
    let (paths, entry_errors) = match note_paths(&directory) {
        Ok(entries) => entries,
        Err(error) => {
            return Ok(NoteLibrary {
                reference_titles: Default::default(),
                notes: Vec::new(),
                issues: vec![NoteLoadIssue {
                    file_name: "notes".to_string(),
                    message: format!("Não foi possível abrir a biblioteca: {error}"),
                    recovery_path: None,
                    recovered: false,
                }],
            });
        }
    };
    let mut notes = Vec::new();
    let mut issues = Vec::new();

    for error in entry_errors {
        issues.push(NoteLoadIssue {
            file_name: "notes".to_string(),
            message: format!("Não foi possível ler uma entrada da biblioteca: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }

    for path in &paths {
        if path.extension().and_then(|extension| extension.to_str()) != Some("omega") {
            continue;
        }
        match note_from_path(path) {
            Ok(note) => notes.push(note),
            Err(error) => {
                let file_name = path
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Nota Ômega Notes".to_string());
                let (recovery_path, recovery_error) =
                    match preserve_recovery_copy(path, &backups_directory) {
                        Ok(path) => (Some(path), None),
                        Err(error) => (None, Some(error)),
                    };
                let mut message = error;
                let mut recovered = false;

                if let Some(note_id) = path.file_stem().and_then(|stem| stem.to_str()) {
                    let backup = note_backup_path(&backups_directory, note_id);
                    if backup.is_file() {
                        match note_from_path_with_id(&backup, note_id) {
                            Ok(note) => match read_file_bytes(&backup) {
                                Ok(bytes) => match restore_file(path, &bytes) {
                                    Ok(()) => {
                                        notes.push(note);
                                        recovered = true;
                                        message = format!(
                                                "A nota atual estava inválida; uma versão anterior foi restaurada. {message}"
                                            );
                                    }
                                    Err(restore_error) => {
                                        message = format!(
                                                "{message} Não foi possível restaurar a cópia anterior: {restore_error}"
                                            );
                                    }
                                },
                                Err(backup_error) => {
                                    message = format!(
                                            "{message} Não foi possível ler a cópia anterior: {backup_error}"
                                        );
                                }
                            },
                            Err(backup_error) => {
                                message = format!(
                                        "{message} A cópia anterior também está inválida: {backup_error}"
                                    );
                            }
                        }
                    }
                }

                if let Some(recovery_error) = recovery_error {
                    message = format!(
                            "{message} Não foi possível criar uma cópia de recuperação: {recovery_error}"
                        );
                }

                issues.push(NoteLoadIssue {
                    file_name,
                    message,
                    recovery_path: recovery_path.map(|path| path.to_string_lossy().into_owned()),
                    recovered,
                });
            }
        }
    }

    let (central_backup_paths, backup_entry_errors) =
        note_paths(&backups_directory).map_err(|error| {
            format!("Não foi possível abrir os arquivos temporários do Vault: {error}")
        })?;
    for error in backup_entry_errors {
        issues.push(NoteLoadIssue {
            file_name: ".temp".to_string(),
            message: format!("Não foi possível ler uma entrada de arquivo temporário: {error}"),
            recovery_path: None,
            recovered: false,
        });
    }
    for backup in central_backup_paths
        .iter()
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("temp"))
    {
        let Some(note_id) = note_id_from_backup(backup) else {
            continue;
        };
        let note_path = note_path(&directory, note_id);
        if note_file_exists(&directory, note_id)
            || crate::notes::note_path(&crate::notes::deleted_notes_directory(&directory), note_id)
                .is_file()
        {
            continue;
        }

        let file_name = note_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Nota Ômega Notes".to_string());
        match note_from_path_with_id(backup, note_id) {
            Ok(note) => {
                match read_file_bytes(backup) {
                    Ok(bytes) => match restore_file(&note_path, &bytes) {
                        Ok(()) => {
                            notes.push(note);
                            issues.push(NoteLoadIssue {
                                file_name,
                                message: "Uma gravação foi interrompida; a cópia anterior foi restaurada.".to_string(),
                                recovery_path: None,
                                recovered: true,
                            });
                        }
                        Err(error) => issues.push(NoteLoadIssue {
                            file_name,
                            message: format!(
                                "A cópia anterior é válida, mas não pôde ser restaurada: {error}"
                            ),
                            recovery_path: preserve_recovery_copy(backup, &backups_directory)
                                .ok()
                                .map(|path| path.to_string_lossy().into_owned()),
                            recovered: false,
                        }),
                    },
                    Err(error) => issues.push(NoteLoadIssue {
                        file_name,
                        message: format!("Não foi possível ler a cópia anterior: {error}"),
                        recovery_path: preserve_recovery_copy(backup, &backups_directory)
                            .ok()
                            .map(|path| path.to_string_lossy().into_owned()),
                        recovered: false,
                    }),
                }
            }
            Err(error) => issues.push(NoteLoadIssue {
                file_name,
                message: format!("A cópia anterior também está inválida: {error}"),
                recovery_path: preserve_recovery_copy(backup, &backups_directory)
                    .ok()
                    .map(|path| path.to_string_lossy().into_owned()),
                recovered: false,
            }),
        }
    }

    notes.sort_by_key(|note| Reverse(note.updated_at));
    let (reference_titles, title_issues) = crate::notes::load_reference_titles(&directory);
    issues.extend(title_issues);
    Ok(NoteLibrary {
        notes,
        issues,
        reference_titles,
    })
}
