use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OmegaNoteFile {
    pub(crate) format: String,
    pub(crate) version: u8,
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) document: NoteDocument,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteDocument {
    pub(crate) format: String,
    pub(crate) version: u8,
    pub(crate) page: PageSize,
    pub(crate) elements: Vec<NoteElement>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct PageSize {
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TextAlignment {
    Left,
    Center,
    Justify,
    Right,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum NoteElement {
    Text {
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        text: String,
        alignment: TextAlignment,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        paragraph_alignments: Vec<TextAlignment>,
    },
    Image {
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        image_id: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StudyNote {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) document: NoteDocument,
    pub(crate) updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteMediaCatalogItem {
    pub(crate) note_id: String,
    pub(crate) note_title: String,
    pub(crate) element_id: String,
    pub(crate) source: NoteMediaSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum NoteMediaSource {
    Image { image_id: String },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteLoadIssue {
    pub(crate) file_name: String,
    pub(crate) message: String,
    pub(crate) recovery_path: Option<String>,
    pub(crate) recovered: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) updated_at: u64,
    pub(crate) links: Vec<String>,
    pub(crate) has_content: bool,
    pub(crate) has_text: bool,
    pub(crate) study_content_characters: usize,
    pub(crate) study_content_words: usize,
    pub(crate) study_content_lines: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteLibrary {
    pub(crate) notes: Vec<StudyNote>,
    pub(crate) issues: Vec<NoteLoadIssue>,
    pub(crate) reference_titles: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteSaveResult {
    pub(crate) note: StudyNote,
    pub(crate) cleanup_issues: Vec<NoteLoadIssue>,
}

pub(crate) struct NoteContentStats {
    pub(crate) note_count: usize,
    pub(crate) image_count: usize,
    pub(crate) character_count: usize,
}
