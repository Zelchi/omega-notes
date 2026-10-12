use std::collections::HashSet;
use uuid::Uuid;

use super::models::{NoteDocument, NoteElement, PageSize, TextAlignment};

pub(crate) fn empty_document() -> NoteDocument {
    NoteDocument {
        format: "omega-document".to_string(),
        version: 1,
        page: PageSize {
            width: 794.0,
            height: 1123.0,
        },
        elements: vec![NoteElement::Text {
            id: Uuid::now_v7().to_string(),
            x: 32.0,
            y: 32.0,
            width: 728.0,
            height: 44.0,
            text: String::new(),
            alignment: TextAlignment::Left,
        }],
    }
}

pub(crate) fn validate_document(document: &NoteDocument) -> Result<(), String> {
    if document.format != "omega-document" || document.version != 1 {
        return Err("Formato de documento Ômega Notes incompatível.".to_string());
    }
    if !document.page.width.is_finite()
        || !document.page.height.is_finite()
        || document.page.width <= 0.0
        || document.page.height <= 0.0
    {
        return Err("Dimensões de nota inválidas.".to_string());
    }
    if document
        .elements
        .iter()
        .filter(|element| matches!(element, NoteElement::Text { .. }))
        .count()
        != 1
    {
        return Err("O documento deve conter exatamente um bloco de texto.".to_string());
    }
    for element in &document.elements {
        match element {
            NoteElement::Text {
                id,
                x,
                y,
                width,
                height,
                ..
            } => {
                if ![x, y, width, height].iter().all(|value| value.is_finite())
                    || *width <= 0.0
                    || *height < 0.0
                    || Uuid::parse_str(id).is_err()
                {
                    return Err("Dimensões de texto inválidas.".to_string());
                }
            }
            NoteElement::Image {
                id,
                x,
                y,
                width,
                height,
                image_id,
                ..
            } => {
                if ![x, y, width, height].iter().all(|value| value.is_finite())
                    || *width <= 0.0
                    || *height < 0.0
                    || Uuid::parse_str(id).is_err()
                    || Uuid::parse_str(image_id).is_err()
                {
                    return Err("Dimensões ou identificador de imagem inválidos.".to_string());
                }
            }
            NoteElement::Audio {
                id,
                x,
                y,
                width,
                height,
                audio_id,
                extension,
                volume,
            } => {
                if ![x, y, width, height, volume]
                    .iter()
                    .all(|value| value.is_finite())
                    || *width <= 0.0
                    || *height <= 0.0
                    || !(0.0..=1.0).contains(volume)
                    || Uuid::parse_str(id).is_err()
                    || Uuid::parse_str(audio_id).is_err()
                    || !crate::media::is_supported_extension("audio", extension)
                {
                    return Err(
                        "Dimensões, volume ou identificador de áudio inválidos.".to_string()
                    );
                }
            }
            NoteElement::Video {
                id,
                x,
                y,
                width,
                height,
                video_id,
                extension,
            } => {
                if ![x, y, width, height].iter().all(|value| value.is_finite())
                    || *width <= 0.0
                    || *height <= 0.0
                    || Uuid::parse_str(id).is_err()
                    || Uuid::parse_str(video_id).is_err()
                    || !crate::media::is_supported_extension("video", extension)
                {
                    return Err("Dimensões ou identificador de vídeo inválidos.".to_string());
                }
            }
        }
    }
    Ok(())
}

pub(crate) fn preview_from_document(document: &NoteDocument) -> String {
    document
        .elements
        .iter()
        .find_map(|element| match element {
            NoteElement::Text { text, .. } => text
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(|line| line.chars().take(160).collect::<String>()),
            NoteElement::Image { .. } => None,
            NoteElement::Audio { .. } | NoteElement::Video { .. } => None,
        })
        .unwrap_or_default()
}

pub(crate) fn image_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Image { image_id, .. } => Some(image_id.clone()),
            NoteElement::Text { .. } | NoteElement::Audio { .. } | NoteElement::Video { .. } => {
                None
            }
        })
        .collect()
}

pub(crate) fn audio_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Audio { audio_id, .. } => Some(audio_id.clone()),
            NoteElement::Text { .. } | NoteElement::Image { .. } | NoteElement::Video { .. } => {
                None
            }
        })
        .collect()
}

pub(crate) fn video_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Video { video_id, .. } => Some(video_id.clone()),
            NoteElement::Text { .. } | NoteElement::Image { .. } | NoteElement::Audio { .. } => {
                None
            }
        })
        .collect()
}
