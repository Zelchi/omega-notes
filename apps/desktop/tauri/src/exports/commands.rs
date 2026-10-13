use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub(crate) async fn export_note_pdf(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("INVALID_PDF".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|error| error.to_string())?;
        crate::storage::atomic_write(&path, &bytes, None)?;
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}
