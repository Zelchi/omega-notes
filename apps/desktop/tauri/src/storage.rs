use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) fn ensure_key_directory(app_directory: &Path) -> Result<(), String> {
    let path = app_directory.join(".key");
    #[cfg(unix)]
    let mut builder = fs::DirBuilder::new();
    #[cfg(not(unix))]
    let builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    match builder.create(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(format!("Não foi possível criar a pasta .key: {error}")),
    }
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Não foi possível acessar a pasta .key: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("A pasta .key precisa ser um diretório local.".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o777 != 0o700 {
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("Não foi possível proteger a pasta .key: {error}"))?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let existing = temporary
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let new = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let moved = unsafe { MoveFileExW(existing.as_ptr(), new.as_ptr(), 0x1 | 0x8) };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(temporary, destination)
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8], backup: Option<&Path>) -> Result<(), String> {
    atomic_write_with(path, backup, |file| file.write_all(bytes))
}

pub(crate) fn atomic_write_with(
    path: &Path,
    backup: Option<&Path>,
    write: impl FnOnce(&mut File) -> std::io::Result<()>,
) -> Result<(), String> {
    atomic_write_inner(path, backup, None, write)
}

pub(crate) fn atomic_write_checked(
    path: &Path,
    bytes: &[u8],
    backup: Option<&Path>,
    expected: Option<&[u8]>,
) -> Result<(), String> {
    atomic_write_inner(path, backup, expected, |file| file.write_all(bytes))
}

fn atomic_write_inner(
    path: &Path,
    backup: Option<&Path>,
    expected: Option<&[u8]>,
    write: impl FnOnce(&mut File) -> std::io::Result<()>,
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Pasta de destino inválida.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    let temporary = parent.join(format!(".{file_name}.{}.tmp", Uuid::now_v7()));

    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        write(&mut file)?;
        file.sync_all()?;
        drop(file);

        if let Some(expected) = expected {
            if fs::read(path).ok().as_deref() != Some(expected) {
                return Err(std::io::Error::other("NOTE_EXTERNAL_CONFLICT"));
            }
        }
        if path.is_file() {
            if let Some(backup) = backup {
                fs::copy(path, backup)?;
                OpenOptions::new().write(true).open(backup)?.sync_all()?;
            }
        }

        if let Some(expected) = expected {
            if fs::read(path).ok().as_deref() != Some(expected) {
                return Err(std::io::Error::other("NOTE_EXTERNAL_CONFLICT"));
            }
        }
        replace_file(&temporary, path)?;

        #[cfg(unix)]
        if let Ok(directory) = File::open(parent) {
            directory.sync_all()?;
        }

        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }

    result.map_err(|error| format!("Não foi possível gravar o arquivo com segurança: {error}"))
}

pub(crate) fn atomic_copy(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Pasta de destino inválida.".to_string())?;
    let file_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    let temporary = parent.join(format!(".{file_name}.{}.tmp", Uuid::now_v7()));

    let result = (|| -> std::io::Result<()> {
        let mut source_file = File::open(source)?;
        let mut target_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        std::io::copy(&mut source_file, &mut target_file)?;
        target_file.sync_all()?;
        drop(target_file);
        drop(source_file);
        replace_file(&temporary, destination)?;
        #[cfg(unix)]
        if let Ok(directory) = File::open(parent) {
            directory.sync_all()?;
        }
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|error| format!("Não foi possível salvar o arquivo com segurança: {error}"))
}

pub(crate) fn preserve_recovery_copy(path: &Path, directory: &Path) -> Result<PathBuf, String> {
    let recovery_directory = directory.join("Recuperação");
    fs::create_dir_all(&recovery_directory)
        .map_err(|error| format!("Não foi possível criar a pasta de recuperação: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    let bytes = fs::read(path)
        .map_err(|error| format!("Não foi possível copiar o arquivo original: {error}"))?;
    let base = recovery_directory.join(format!("{file_name}.recovery"));
    let target = if base.exists() {
        if fs::read(&base).ok().as_deref() == Some(bytes.as_slice()) {
            return Ok(base);
        }
        recovery_directory.join(format!("{file_name}.{}.recovery", Uuid::now_v7()))
    } else {
        base
    };

    atomic_write(&target, &bytes, None)?;
    Ok(target)
}

#[cfg(test)]
mod checked_write_tests {
    use super::*;

    #[test]
    fn changed_or_deleted_file_is_not_replaced_and_temporary_is_removed() {
        let root = std::env::temp_dir().join(format!("omega-checked-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let path = root.join("note.omega");
        fs::write(&path, b"external").unwrap();
        assert!(
            atomic_write_checked(&path, b"local", None, Some(b"original"))
                .unwrap_err()
                .contains("NOTE_EXTERNAL_CONFLICT")
        );
        assert_eq!(fs::read(&path).unwrap(), b"external");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_file(&path).unwrap();
        assert!(
            atomic_write_checked(&path, b"local", None, Some(b"original"))
                .unwrap_err()
                .contains("NOTE_EXTERNAL_CONFLICT")
        );
        assert!(!path.exists());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn matching_revision_is_saved_and_previous_bytes_are_backed_up() {
        let root = std::env::temp_dir().join(format!("omega-checked-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let path = root.join("note.omega");
        let backup = root.join("backup");
        fs::write(&path, b"original").unwrap();
        atomic_write_checked(&path, b"local", Some(&backup), Some(b"original")).unwrap();
        assert_eq!(fs::read(path).unwrap(), b"local");
        assert_eq!(fs::read(backup).unwrap(), b"original");
        fs::remove_dir_all(root).unwrap();
    }
}
