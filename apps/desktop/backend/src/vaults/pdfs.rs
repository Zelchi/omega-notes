use crate::runtime::AppContext;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const CATALOG_FILE: &str = ".pdfs.json";
const PDF_DIRECTORY: &str = "pdfs";
const HIGHLIGHTS_SUFFIX: &str = ".highlights.json";
const MAX_DOCUMENTS: usize = 1000;
const MAX_CATALOG_BYTES: u64 = 4_000_000;
const MAX_HIGHLIGHTS: usize = 1000;
const MAX_HIGHLIGHT_RECTS: usize = 500;
const MAX_HIGHLIGHT_TEXT_CHARS: usize = 10_000;
const MAX_HIGHLIGHTS_BYTES: u64 = 8_000_000;
const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 500;
static STORAGE: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfDocument {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) size_bytes: u64,
    pub(crate) imported_at: u64,
    pub(crate) last_page: u32,
    pub(crate) page_count: u32,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfCatalog {
    version: u8,
    documents: Vec<PdfDocument>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfHighlightRect {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PdfHighlightColor {
    #[default]
    Yellow,
    Green,
    Blue,
    Pink,
    Purple,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfHighlight {
    pub(crate) id: String,
    pub(crate) page: u32,
    pub(crate) text: String,
    pub(crate) rects: Vec<PdfHighlightRect>,
    #[serde(default)]
    pub(crate) color: PdfHighlightColor,
    #[serde(default)]
    pub(crate) note_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfHighlightsFile {
    version: u8,
    highlights: Vec<PdfHighlight>,
}

fn vault_root(app: &AppContext, vault_id: &str) -> Result<PathBuf, String> {
    let id = Uuid::parse_str(vault_id).map_err(|_| "PDF_STORAGE_FAILED")?;
    if id.to_string() != vault_id {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let directory = crate::app::runtime::app_directory(app)?;
    let registry = crate::vaults::read_vault_registry(&directory)?;
    let vault = registry
        .vaults
        .iter()
        .find(|vault| vault.id == vault_id)
        .ok_or("PDF_STORAGE_FAILED")?;
    let root = crate::vaults::vault_directory(&directory, vault)?;
    let metadata = fs::symlink_metadata(&root).map_err(|_| "PDF_STORAGE_FAILED")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("PDF_STORAGE_FAILED".into());
    }
    Ok(root)
}

fn catalog_path(root: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(root).map_err(|_| "PDF_STORAGE_FAILED")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let path = root.join(CATALOG_FILE);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("PDF_STORAGE_FAILED".into()),
    }
    Ok(path)
}

fn pdf_directory(root: &Path, create: bool) -> Result<PathBuf, String> {
    let root_metadata = fs::symlink_metadata(root).map_err(|_| "PDF_STORAGE_FAILED")?;
    if !root_metadata.is_dir() || root_metadata.file_type().is_symlink() {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let directory = root.join(PDF_DIRECTORY);
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
            fs::create_dir(&directory).map_err(|_| "PDF_STORAGE_FAILED")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(directory),
        _ => return Err("PDF_STORAGE_FAILED".into()),
    }
    Ok(directory)
}

fn validate_catalog(catalog: &PdfCatalog) -> Result<(), String> {
    if catalog.version != 1 || catalog.documents.len() > MAX_DOCUMENTS {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let mut ids = std::collections::HashSet::with_capacity(catalog.documents.len());
    for document in &catalog.documents {
        let id = Uuid::parse_str(&document.id).map_err(|_| "PDF_STORAGE_FAILED")?;
        if id.to_string() != document.id
            || !ids.insert(document.id.as_str())
            || document.title.trim().is_empty()
            || document.title.chars().count() > MAX_TITLE_CHARS
            || document.size_bytes == 0
            || document.size_bytes > MAX_PDF_BYTES
            || document.last_page == 0
            || document.page_count > 1_000_000
            || (document.page_count > 0 && document.last_page > document.page_count)
        {
            return Err("PDF_STORAGE_FAILED".into());
        }
    }
    Ok(())
}

fn validate_highlights(highlights: &[PdfHighlight], page_count: u32) -> Result<(), String> {
    if highlights.len() > MAX_HIGHLIGHTS {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    let mut ids = std::collections::HashSet::with_capacity(highlights.len());
    for highlight in highlights {
        let id = Uuid::parse_str(&highlight.id).map_err(|_| "PDF_HIGHLIGHTS_INVALID")?;
        if id.to_string() != highlight.id
            || !ids.insert(highlight.id.as_str())
            || highlight.page == 0
            || highlight.page > 1_000_000
            || (page_count > 0 && highlight.page > page_count)
            || highlight.text.trim().is_empty()
            || highlight.text.chars().count() > MAX_HIGHLIGHT_TEXT_CHARS
            || highlight.rects.is_empty()
            || highlight.rects.len() > MAX_HIGHLIGHT_RECTS
        {
            return Err("PDF_HIGHLIGHTS_INVALID".into());
        }
        if let Some(note_id) = &highlight.note_id {
            let note_uuid = Uuid::parse_str(note_id).map_err(|_| "PDF_HIGHLIGHTS_INVALID")?;
            if note_uuid.to_string() != note_id.as_str() {
                return Err("PDF_HIGHLIGHTS_INVALID".into());
            }
        }
        for rect in &highlight.rects {
            if !rect.x.is_finite()
                || !rect.y.is_finite()
                || !rect.width.is_finite()
                || !rect.height.is_finite()
                || rect.x < 0.0
                || rect.y < 0.0
                || rect.width <= 0.0
                || rect.height <= 0.0
                || rect.x + rect.width > 1.001
                || rect.y + rect.height > 1.001
            {
                return Err("PDF_HIGHLIGHTS_INVALID".into());
            }
        }
    }
    Ok(())
}

fn highlights_path(root: &Path, document_id: &str) -> Result<PathBuf, String> {
    let id = Uuid::parse_str(document_id).map_err(|_| "PDF_STORAGE_FAILED")?;
    if id.to_string() != document_id {
        return Err("PDF_STORAGE_FAILED".into());
    }
    Ok(pdf_directory(root, false)?.join(format!("{document_id}{HIGHLIGHTS_SUFFIX}")))
}

fn read_highlights_from_root(root: &Path, document_id: &str) -> Result<Vec<PdfHighlight>, String> {
    let catalog = read_catalog(root)?;
    let document = catalog
        .documents
        .iter()
        .find(|document| document.id == document_id)
        .ok_or("PDF_NOT_FOUND")?;
    let path = highlights_path(root, document_id)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        _ => return Err("PDF_HIGHLIGHTS_INVALID".into()),
    };
    if metadata.len() > MAX_HIGHLIGHTS_BYTES {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    let file: PdfHighlightsFile =
        serde_json::from_slice(&fs::read(path).map_err(|_| "PDF_HIGHLIGHTS_INVALID")?)
            .map_err(|_| "PDF_HIGHLIGHTS_INVALID")?;
    if file.version != 1 {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    validate_highlights(&file.highlights, document.page_count)?;
    Ok(file.highlights)
}

fn write_highlights_to_root(
    root: &Path,
    document_id: &str,
    highlights: &[PdfHighlight],
) -> Result<(), String> {
    let catalog = read_catalog(root)?;
    let document = catalog
        .documents
        .iter()
        .find(|document| document.id == document_id)
        .ok_or("PDF_NOT_FOUND")?;
    validate_highlights(highlights, document.page_count)?;
    let file = PdfHighlightsFile {
        version: 1,
        highlights: highlights.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&file).map_err(|_| "PDF_HIGHLIGHTS_INVALID")?;
    if bytes.len() as u64 > MAX_HIGHLIGHTS_BYTES {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    crate::storage::atomic_write(&highlights_path(root, document_id)?, &bytes, None)
        .map_err(|_| "PDF_HIGHLIGHTS_SAVE_FAILED".into())
}

fn add_highlight_in_root(
    root: &Path,
    document_id: &str,
    highlight: PdfHighlight,
) -> Result<Vec<PdfHighlight>, String> {
    let mut highlights = read_highlights_from_root(root, document_id)?;
    if highlights.iter().any(|saved| saved.id == highlight.id) {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    highlights.push(highlight);
    write_highlights_to_root(root, document_id, &highlights)?;
    Ok(highlights)
}

fn update_highlight_in_root(
    root: &Path,
    document_id: &str,
    highlight: PdfHighlight,
) -> Result<Vec<PdfHighlight>, String> {
    let mut highlights = read_highlights_from_root(root, document_id)?;
    let index = highlights
        .iter()
        .position(|saved| saved.id == highlight.id)
        .ok_or("PDF_HIGHLIGHT_NOT_FOUND")?;
    highlights[index] = highlight;
    write_highlights_to_root(root, document_id, &highlights)?;
    Ok(highlights)
}

fn delete_highlight_in_root(
    root: &Path,
    document_id: &str,
    highlight_id: &str,
) -> Result<Vec<PdfHighlight>, String> {
    let id = Uuid::parse_str(highlight_id).map_err(|_| "PDF_HIGHLIGHTS_INVALID")?;
    if id.to_string() != highlight_id {
        return Err("PDF_HIGHLIGHTS_INVALID".into());
    }
    let mut highlights = read_highlights_from_root(root, document_id)?;
    let index = highlights
        .iter()
        .position(|highlight| highlight.id == highlight_id)
        .ok_or("PDF_HIGHLIGHT_NOT_FOUND")?;
    highlights.remove(index);
    let path = highlights_path(root, document_id)?;
    if highlights.is_empty() {
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                fs::remove_file(path).map_err(|_| "PDF_HIGHLIGHTS_SAVE_FAILED")?;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            _ => return Err("PDF_HIGHLIGHTS_INVALID".into()),
        }
    } else {
        write_highlights_to_root(root, document_id, &highlights)?;
    }
    Ok(highlights)
}

fn read_catalog(root: &Path) -> Result<PdfCatalog, String> {
    let path = catalog_path(root)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PdfCatalog {
                version: 1,
                documents: Vec::new(),
            });
        }
        _ => return Err("PDF_STORAGE_FAILED".into()),
    };
    if metadata.len() > MAX_CATALOG_BYTES {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let catalog: PdfCatalog =
        serde_json::from_slice(&fs::read(path).map_err(|_| "PDF_STORAGE_FAILED")?)
            .map_err(|_| "PDF_STORAGE_FAILED")?;
    validate_catalog(&catalog)?;
    Ok(catalog)
}

fn write_catalog(root: &Path, catalog: &PdfCatalog) -> Result<(), String> {
    validate_catalog(catalog)?;
    let bytes = serde_json::to_vec_pretty(catalog).map_err(|_| "PDF_STORAGE_FAILED")?;
    if bytes.len() as u64 > MAX_CATALOG_BYTES {
        return Err("PDF_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&catalog_path(root)?, &bytes, None)
        .map_err(|_| "PDF_STORAGE_FAILED".into())
}

fn pdf_path(root: &Path, document_id: &str) -> Result<PathBuf, String> {
    let id = Uuid::parse_str(document_id).map_err(|_| "PDF_STORAGE_FAILED")?;
    if id.to_string() != document_id {
        return Err("PDF_STORAGE_FAILED".into());
    }
    let path = pdf_directory(root, false)?.join(format!("{document_id}.pdf"));
    let metadata = fs::symlink_metadata(&path).map_err(|_| "PDF_NOT_FOUND")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() == 0 {
        return Err("PDF_NOT_FOUND".into());
    }
    Ok(path)
}

fn normalize_title(title: &str) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err("PDF_TITLE_INVALID".into());
    }
    Ok(title.to_owned())
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn open_pdf_source(source: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    options.open(source).map_err(|_| "PDF_IMPORT_FAILED".into())
}

fn check_pdf_source(source: &Path) -> Result<(File, u64), String> {
    if source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("pdf"))
    {
        return Err("PDF_FORMAT_INVALID".into());
    }
    let path_metadata = fs::symlink_metadata(source).map_err(|_| "PDF_IMPORT_FAILED")?;
    if !path_metadata.is_file() || path_metadata.file_type().is_symlink() {
        return Err("PDF_IMPORT_FAILED".into());
    }
    let mut file = open_pdf_source(source)?;
    let metadata = file.metadata().map_err(|_| "PDF_IMPORT_FAILED")?;
    if !metadata.is_file() {
        return Err("PDF_IMPORT_FAILED".into());
    }
    if metadata.len() == 0 || metadata.len() > MAX_PDF_BYTES {
        return Err("PDF_SIZE_INVALID".into());
    }
    let mut header = [0_u8; 1024];
    let bytes = file.read(&mut header).map_err(|_| "PDF_IMPORT_FAILED")?;
    if !header[..bytes].windows(5).any(|window| window == b"%PDF-") {
        return Err("PDF_FORMAT_INVALID".into());
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "PDF_IMPORT_FAILED")?;
    Ok((file, metadata.len()))
}

fn list_from_root(root: &Path) -> Result<Vec<PdfDocument>, String> {
    let mut documents = read_catalog(root)?.documents;
    documents.sort_by(|left, right| {
        left.title
            .to_lowercase()
            .cmp(&right.title.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(documents)
}

fn import_into_root(root: &Path, source_path: &str, title: &str) -> Result<PdfDocument, String> {
    let title = normalize_title(title)?;
    let source = Path::new(source_path);
    let (mut source_file, size_bytes) = check_pdf_source(source)?;
    let mut catalog = read_catalog(root)?;
    if catalog.documents.len() >= MAX_DOCUMENTS {
        return Err("PDF_LIMIT_REACHED".into());
    }
    let directory = pdf_directory(root, true)?;
    let id = Uuid::now_v7().to_string();
    let destination = directory.join(format!("{id}.pdf"));
    let mut copy_failure = None;
    if crate::storage::atomic_write_with(&destination, None, |target| {
        let copied = io::copy(
            &mut Read::by_ref(&mut source_file).take(MAX_PDF_BYTES + 1),
            target,
        )?;
        if copied > MAX_PDF_BYTES {
            copy_failure = Some("PDF_SIZE_INVALID");
            return Err(io::Error::other("PDF_SIZE_INVALID"));
        }
        if copied != size_bytes {
            copy_failure = Some("PDF_IMPORT_FAILED");
            return Err(io::Error::other("PDF_IMPORT_FAILED"));
        }
        Ok(())
    })
    .is_err()
    {
        return Err(copy_failure.unwrap_or("PDF_IMPORT_FAILED").into());
    }
    let document = PdfDocument {
        id,
        title,
        size_bytes,
        imported_at: current_timestamp(),
        last_page: 1,
        page_count: 0,
    };
    catalog.version = 1;
    catalog.documents.push(document.clone());
    if let Err(error) = write_catalog(root, &catalog) {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(document)
}

fn rename_in_root(root: &Path, document_id: &str, title: &str) -> Result<Vec<PdfDocument>, String> {
    let title = normalize_title(title)?;
    let mut catalog = read_catalog(root)?;
    let document = catalog
        .documents
        .iter_mut()
        .find(|document| document.id == document_id)
        .ok_or("PDF_NOT_FOUND")?;
    document.title = title;
    write_catalog(root, &catalog)?;
    Ok(list_from_root(root)?.into_iter().collect())
}

fn delete_from_root(root: &Path, document_id: &str) -> Result<Vec<PdfDocument>, String> {
    let id = Uuid::parse_str(document_id).map_err(|_| "PDF_NOT_FOUND")?;
    if id.to_string() != document_id {
        return Err("PDF_NOT_FOUND".into());
    }
    let mut catalog = read_catalog(root)?;
    let index = catalog
        .documents
        .iter()
        .position(|document| document.id == document_id)
        .ok_or("PDF_NOT_FOUND")?;
    let directory = pdf_directory(root, false)?;
    let original = directory.join(format!("{document_id}.pdf"));
    let staged = directory.join(format!(".{document_id}.deleting"));
    let original_highlights = directory.join(format!("{document_id}{HIGHLIGHTS_SUFFIX}"));
    let staged_highlights = directory.join(format!(".{document_id}.highlights.deleting"));
    let has_file = match fs::symlink_metadata(&original) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            fs::rename(&original, &staged).map_err(|_| "PDF_DELETE_FAILED")?;
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        _ => return Err("PDF_DELETE_FAILED".into()),
    };
    let has_highlights = match fs::symlink_metadata(&original_highlights) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            if fs::rename(&original_highlights, &staged_highlights).is_err() {
                if has_file {
                    let _ = fs::rename(&staged, &original);
                }
                return Err("PDF_DELETE_FAILED".into());
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        _ => {
            if has_file {
                let _ = fs::rename(&staged, &original);
            }
            return Err("PDF_DELETE_FAILED".into());
        }
    };
    catalog.documents.remove(index);
    if let Err(error) = write_catalog(root, &catalog) {
        if has_file {
            let _ = fs::rename(&staged, &original);
        }
        if has_highlights {
            let _ = fs::rename(&staged_highlights, &original_highlights);
        }
        return Err(error);
    }
    if has_file {
        let _ = fs::remove_file(staged);
    }
    if has_highlights {
        let _ = fs::remove_file(staged_highlights);
    }
    list_from_root(root)
}

fn save_progress_in_root(
    root: &Path,
    document_id: &str,
    page: u32,
    page_count: u32,
) -> Result<(), String> {
    if page == 0 || page_count == 0 || page > page_count || page_count > 1_000_000 {
        return Err("PDF_PROGRESS_INVALID".into());
    }
    let mut catalog = read_catalog(root)?;
    let document = catalog
        .documents
        .iter_mut()
        .find(|document| document.id == document_id)
        .ok_or("PDF_NOT_FOUND")?;
    document.last_page = page;
    document.page_count = page_count;
    write_catalog(root, &catalog)
}

fn with_storage<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _vault_lock = crate::vaults::lock_vault_registry_mutations()?;
    let _guard = STORAGE.lock().map_err(|_| "PDF_STORAGE_FAILED")?;
    operation()
}

pub(crate) async fn read_pdf_documents(
    app: AppContext,
    vault_id: String,
) -> Result<Vec<PdfDocument>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| list_from_root(&vault_root(&app, &vault_id)?))
    })
    .await
    .map_err(|_| "PDF_STORAGE_FAILED".to_string())?
}

pub(crate) async fn import_pdf_document(
    app: AppContext,
    vault_id: String,
    source_path: String,
    title: String,
) -> Result<PdfDocument, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| import_into_root(&vault_root(&app, &vault_id)?, &source_path, &title))
    })
    .await
    .map_err(|_| "PDF_IMPORT_FAILED".to_string())?
}

pub(crate) async fn rename_pdf_document(
    app: AppContext,
    vault_id: String,
    document_id: String,
    title: String,
) -> Result<Vec<PdfDocument>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| rename_in_root(&vault_root(&app, &vault_id)?, &document_id, &title))
    })
    .await
    .map_err(|_| "PDF_STORAGE_FAILED".to_string())?
}

pub(crate) async fn delete_pdf_document(
    app: AppContext,
    vault_id: String,
    document_id: String,
) -> Result<Vec<PdfDocument>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| delete_from_root(&vault_root(&app, &vault_id)?, &document_id))
    })
    .await
    .map_err(|_| "PDF_DELETE_FAILED".to_string())?
}

pub(crate) async fn save_pdf_progress(
    app: AppContext,
    vault_id: String,
    document_id: String,
    page: u32,
    page_count: u32,
) -> Result<(), String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| {
            save_progress_in_root(
                &vault_root(&app, &vault_id)?,
                &document_id,
                page,
                page_count,
            )
        })
    })
    .await
    .map_err(|_| "PDF_STORAGE_FAILED".to_string())?
}

pub(crate) async fn read_pdf_highlights(
    app: AppContext,
    vault_id: String,
    document_id: String,
) -> Result<Vec<PdfHighlight>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| read_highlights_from_root(&vault_root(&app, &vault_id)?, &document_id))
    })
    .await
    .map_err(|_| "PDF_HIGHLIGHTS_INVALID".to_string())?
}

pub(crate) async fn add_pdf_highlight(
    app: AppContext,
    vault_id: String,
    document_id: String,
    highlight: PdfHighlight,
) -> Result<Vec<PdfHighlight>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| {
            add_highlight_in_root(&vault_root(&app, &vault_id)?, &document_id, highlight)
        })
    })
    .await
    .map_err(|_| "PDF_HIGHLIGHTS_SAVE_FAILED".to_string())?
}

pub(crate) async fn update_pdf_highlight(
    app: AppContext,
    vault_id: String,
    document_id: String,
    highlight: PdfHighlight,
) -> Result<Vec<PdfHighlight>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| {
            update_highlight_in_root(&vault_root(&app, &vault_id)?, &document_id, highlight)
        })
    })
    .await
    .map_err(|_| "PDF_HIGHLIGHTS_SAVE_FAILED".to_string())?
}

pub(crate) async fn delete_pdf_highlight(
    app: AppContext,
    vault_id: String,
    document_id: String,
    highlight_id: String,
) -> Result<Vec<PdfHighlight>, String> {
    crate::runtime::spawn_blocking(move || {
        with_storage(|| {
            delete_highlight_in_root(&vault_root(&app, &vault_id)?, &document_id, &highlight_id)
        })
    })
    .await
    .map_err(|_| "PDF_HIGHLIGHTS_SAVE_FAILED".to_string())?
}

pub(crate) fn pdf_document_path(
    app: &AppContext,
    vault_id: &str,
    document_id: &str,
) -> Result<PathBuf, String> {
    with_storage(|| {
        let root = vault_root(app, vault_id)?;
        let catalog = read_catalog(&root)?;
        if !catalog
            .documents
            .iter()
            .any(|document| document.id == document_id)
        {
            return Err("PDF_NOT_FOUND".into());
        }
        pdf_path(&root, document_id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_pdf(path: &Path) {
        fs::write(path, b"%PDF-1.7\nminimal fixture").unwrap();
    }

    fn sample_highlight(page: u32) -> PdfHighlight {
        PdfHighlight {
            id: Uuid::now_v7().to_string(),
            page,
            text: "selected PDF text".into(),
            rects: vec![PdfHighlightRect {
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.04,
            }],
            color: PdfHighlightColor::Yellow,
            note_id: None,
        }
    }

    #[test]
    fn missing_catalog_is_an_empty_library_and_round_trips() {
        let root = tempfile::tempdir().unwrap();
        assert!(list_from_root(root.path()).unwrap().is_empty());
        write_catalog(
            root.path(),
            &PdfCatalog {
                version: 1,
                documents: Vec::new(),
            },
        )
        .unwrap();
        assert!(list_from_root(root.path()).unwrap().is_empty());
    }

    #[test]
    fn import_uses_an_internal_id_and_the_user_title_not_the_source_filename() {
        let root = tempfile::tempdir().unwrap();
        let source_directory = tempfile::tempdir().unwrap();
        let source = source_directory.path().join("original-name.pdf");
        sample_pdf(&source);

        let document =
            import_into_root(root.path(), source.to_str().unwrap(), "  My book  ").unwrap();
        assert_eq!(document.title, "My book");
        assert!(root
            .path()
            .join("pdfs")
            .join(format!("{}.pdf", document.id))
            .is_file());
        let listed = list_from_root(root.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "My book");
        assert!(!root.path().join("pdfs/original-name.pdf").exists());
    }

    #[test]
    fn rejects_non_pdf_content_bad_extension_and_symlinks() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let wrong_extension = sources.path().join("book.txt");
        fs::write(&wrong_extension, b"%PDF-1.7").unwrap();
        assert_eq!(
            import_into_root(root.path(), wrong_extension.to_str().unwrap(), "Book").unwrap_err(),
            "PDF_FORMAT_INVALID"
        );
        let wrong_content = sources.path().join("not-a-pdf.pdf");
        fs::write(&wrong_content, b"not a document").unwrap();
        assert_eq!(
            import_into_root(root.path(), wrong_content.to_str().unwrap(), "Book").unwrap_err(),
            "PDF_FORMAT_INVALID"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let valid = sources.path().join("valid.pdf");
            sample_pdf(&valid);
            let link = sources.path().join("linked.pdf");
            symlink(&valid, &link).unwrap();
            assert_eq!(
                import_into_root(root.path(), link.to_str().unwrap(), "Book").unwrap_err(),
                "PDF_IMPORT_FAILED"
            );
        }
        assert!(list_from_root(root.path()).unwrap().is_empty());
    }

    #[test]
    fn rename_progress_and_delete_keep_catalog_and_files_consistent() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let source = sources.path().join("book.pdf");
        sample_pdf(&source);
        let document = import_into_root(root.path(), source.to_str().unwrap(), "Book").unwrap();
        rename_in_root(root.path(), &document.id, "Renamed").unwrap();
        save_progress_in_root(root.path(), &document.id, 7, 30).unwrap();
        add_highlight_in_root(root.path(), &document.id, sample_highlight(7)).unwrap();
        let saved = list_from_root(root.path()).unwrap().remove(0);
        assert_eq!(saved.title, "Renamed");
        assert_eq!(saved.last_page, 7);
        assert_eq!(saved.page_count, 30);
        delete_from_root(root.path(), &document.id).unwrap();
        assert!(list_from_root(root.path()).unwrap().is_empty());
        assert!(!root
            .path()
            .join("pdfs")
            .join(format!("{}.pdf", document.id))
            .exists());
        assert!(!root
            .path()
            .join("pdfs")
            .join(format!("{}{HIGHLIGHTS_SUFFIX}", document.id))
            .exists());
    }

    #[test]
    fn highlights_round_trip_per_document_and_can_be_removed() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let source = sources.path().join("book.pdf");
        sample_pdf(&source);
        let document = import_into_root(root.path(), source.to_str().unwrap(), "Book").unwrap();
        let highlight = sample_highlight(1);

        let saved = add_highlight_in_root(root.path(), &document.id, highlight.clone()).unwrap();
        assert_eq!(saved, vec![highlight.clone()]);
        assert_eq!(
            read_highlights_from_root(root.path(), &document.id).unwrap(),
            vec![highlight.clone()]
        );

        assert!(
            delete_highlight_in_root(root.path(), &document.id, &highlight.id)
                .unwrap()
                .is_empty()
        );
        assert!(read_highlights_from_root(root.path(), &document.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn highlight_edits_persist_color_and_note_link() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let source = sources.path().join("book.pdf");
        sample_pdf(&source);
        let document = import_into_root(root.path(), source.to_str().unwrap(), "Book").unwrap();
        let highlight = sample_highlight(1);
        add_highlight_in_root(root.path(), &document.id, highlight.clone()).unwrap();

        let mut edited = highlight.clone();
        edited.color = PdfHighlightColor::Blue;
        edited.note_id = Some(Uuid::now_v7().to_string());
        assert_eq!(
            update_highlight_in_root(root.path(), &document.id, edited.clone()).unwrap(),
            vec![edited.clone()]
        );
        assert_eq!(
            read_highlights_from_root(root.path(), &document.id).unwrap(),
            vec![edited]
        );
    }

    #[test]
    fn old_highlight_records_default_to_yellow_without_a_note() {
        let old_record = serde_json::json!({
            "id": Uuid::now_v7().to_string(),
            "page": 1,
            "text": "selected PDF text",
            "rects": [{ "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.04 }]
        });
        let highlight: PdfHighlight = serde_json::from_value(old_record).unwrap();
        assert_eq!(highlight.color, PdfHighlightColor::Yellow);
        assert_eq!(highlight.note_id, None);
    }

    #[test]
    fn rejects_out_of_page_highlight_rectangles_and_pages() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let source = sources.path().join("book.pdf");
        sample_pdf(&source);
        let document = import_into_root(root.path(), source.to_str().unwrap(), "Book").unwrap();
        save_progress_in_root(root.path(), &document.id, 1, 2).unwrap();

        let mut outside_rect = sample_highlight(1);
        outside_rect.rects[0].x = 0.9;
        assert_eq!(
            add_highlight_in_root(root.path(), &document.id, outside_rect).unwrap_err(),
            "PDF_HIGHLIGHTS_INVALID"
        );
        assert_eq!(
            add_highlight_in_root(root.path(), &document.id, sample_highlight(3)).unwrap_err(),
            "PDF_HIGHLIGHTS_INVALID"
        );
        assert!(read_highlights_from_root(root.path(), &document.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn rejects_highlights_with_invalid_note_ids() {
        let mut highlight = sample_highlight(1);
        highlight.note_id = Some("not-a-uuid".into());
        assert_eq!(
            validate_highlights(&[highlight], 1).unwrap_err(),
            "PDF_HIGHLIGHTS_INVALID"
        );
    }

    #[test]
    fn rejects_invalid_progress_and_catalog_entries() {
        let root = tempfile::tempdir().unwrap();
        let sources = tempfile::tempdir().unwrap();
        let source = sources.path().join("book.pdf");
        sample_pdf(&source);
        let document = import_into_root(root.path(), source.to_str().unwrap(), "Book").unwrap();
        assert_eq!(
            save_progress_in_root(root.path(), &document.id, 3, 2).unwrap_err(),
            "PDF_PROGRESS_INVALID"
        );
        assert_eq!(normalize_title("  ").unwrap_err(), "PDF_TITLE_INVALID");
        assert_eq!(
            validate_catalog(&PdfCatalog {
                version: 1,
                documents: vec![PdfDocument {
                    id: document.id,
                    title: "Book".into(),
                    size_bytes: 12,
                    imported_at: 1,
                    last_page: 0,
                    page_count: 0,
                }],
            })
            .unwrap_err(),
            "PDF_STORAGE_FAILED"
        );
    }
}
