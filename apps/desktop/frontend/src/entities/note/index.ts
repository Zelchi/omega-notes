export { useNotes } from "./model/notes-library";
export type { NotesLibrary } from "./model/notes-library";
export { listNoteMedia } from "./api/notes.repository";
export type { NoteLinkPatch } from "./model/note-link-patch";
export { parseNoteTextLinks, type NoteTextLink } from "./model/text-links";
export { createNoteReferenceNormalizer } from "./model/reference-normalizer";
export { createEditableNoteReferences } from "./model/editable-note-references";
export { paragraphStarts, paragraphIndexAt, remapParagraphAlignments } from "./model/text-alignment";

export type { NoteLoadIssue, NoteMediaCatalogItem, NoteMediaSource, NoteSummary, StudyNote } from "./model/note";
export { summarizeNote } from "./model/note-summary";
export {
	createAudioElement,
	createImageElement,
	createTextElement,
	createVideoElement,
	documentText,
	DEFAULT_AUDIO_VOLUME,
	MIN_AUDIO_WIDTH,
	noteMediaSource,
} from "./model/note-document";
export type {
	NoteDocument,
	NoteElement,
	NoteAudioElement,
	NoteImageElement,
	NoteMediaElement,
	NotePositionedElement,
	NoteTextElement,
	NoteTextAlignment,
	NoteVideoElement,
} from "./model/note-document";
export {
	createNoteTitleIndex,
	createNoteDisplayTitleIndex,
	displayNoteTitle,
	NOTE_TITLE_MAX_LENGTH,
	normalizeNoteTitle,
	resolveNoteReference,
} from "./model/note-titles";

export { canCreateNoteReference, bindNoteReferences } from "./model/note-links";
