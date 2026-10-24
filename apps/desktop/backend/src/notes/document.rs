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
            paragraph_alignments: Vec::new(),
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
                text,
                paragraph_alignments,
                ..
            } => {
                if !paragraph_alignments.is_empty()
                    && paragraph_alignments.len() != text.split('\n').count()
                {
                    return Err("Alinhamentos de parágrafos inválidos.".to_string());
                }
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
                        "Dimensões, volume ou identificador de áudio inválidos.".to_string(),
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

pub(crate) fn audio_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Audio { audio_id, .. } => {
                Uuid::parse_str(audio_id).ok().map(|uuid| uuid.to_string())
            }
            NoteElement::Text { .. } | NoteElement::Image { .. } | NoteElement::Video { .. } => None,
        })
        .collect()
}

pub(crate) fn video_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Video { video_id, .. } => {
                Uuid::parse_str(video_id).ok().map(|uuid| uuid.to_string())
            }
            NoteElement::Text { .. } | NoteElement::Image { .. } | NoteElement::Audio { .. } => None,
        })
        .collect()
}

pub(crate) fn image_ids_in_document(document: &NoteDocument) -> HashSet<String> {
    document
        .elements
        .iter()
        .filter_map(|element| match element {
            NoteElement::Image { image_id, .. } => Some(image_id.clone()),
            NoteElement::Text { .. } | NoteElement::Audio { .. } | NoteElement::Video { .. } => None,
        })
        .collect()
}
