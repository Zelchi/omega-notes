export { useNotes } from "./model/notes-library";
export type { NotesLibrary } from "./model/notes-library";
export { parseNoteTextLinks, type NoteTextLink } from "./model/text-links";
export { createNoteReferenceNormalizer } from "./model/reference-normalizer";
export { createEditableNoteReferences } from "./model/editable-note-references";
export { paragraphStarts, paragraphIndexAt, remapParagraphAlignments } from "./model/text-alignment";

export type { NoteLoadIssue, StudyNote } from "./model/note";
export {
	createAudioElement,
	createImageElement,
	createTextElement,
	createVideoElement,
	documentText,
	DEFAULT_AUDIO_VOLUME,
	MIN_AUDIO_WIDTH,
} from "./model/note-document";
export type {
	NoteDocument,
	NoteElement,
	NoteImageElement,
	NoteMediaElement,
	NotePositionedElement,
	NoteTextElement,
	NoteTextAlignment,
} from "./model/note-document";
export {
	createNoteTitleIndex,
	isNoteTitleAvailable,
	normalizeNoteTitle,
	resolveNoteReference,
} from "./model/note-titles";

export { canCreateNoteReference, bindNoteReferences } from "./model/note-links";
