import { createUuidV7 } from "@/shared/lib/ids";
import type { NoteLibrary, NoteLoadIssue, NoteSaveResult, NoteStorageStats, StudyNote } from "../model/note";
import { createEmptyDocument, documentPreview } from "../model/note-document";
import { renameResolvedNoteLinks } from "../model/note-links";
import { isNoteTitleAvailable, normalizeNoteTitle } from "../model/note-titles";

const STORAGE_KEY = "omega-notes.notes.v1";
let activeVaultId: string | undefined;

export const setNotesVaultId = (vaultId: string | undefined): void => {
	activeVaultId = vaultId;
};

const notesStorageKey = (vaultId: string): string => `${STORAGE_KEY}:${vaultId}`;

const vaultStorageKey = (): string => notesStorageKey(activeVaultId ?? "default");

const parseNotes = (serialized: string): StudyNote[] => {
	const notes = JSON.parse(serialized) as StudyNote[];
	if (!Array.isArray(notes) || notes.some((note) => {
		const document = note?.document;
		if (document?.format !== "omega-document" || document.version !== 1 || !Array.isArray(document.elements)) {
			return true;
		}
		const texts = document.elements.filter((element) => element.type === "text");
		return texts.length !== 1 || document.elements.some((element) =>
			(element.type === "text" && !["left", "center", "justify", "right"].includes(element.alignment)) ||
			(element.type === "text" && element.paragraphAlignments !== undefined &&
				(!Array.isArray(element.paragraphAlignments) ||
					(element.paragraphAlignments.length > 0 && element.paragraphAlignments.length !== element.text.split("\n").length) ||
					element.paragraphAlignments.some((alignment) => !["left", "center", "justify", "right"].includes(alignment)))) ||
			(element.type === "audio" && (!Number.isFinite(element.volume) || element.volume < 0 || element.volume > 1)),
		);
	})) {
		throw new Error("Formato de nota Ômega Notes incompatível.");
	}
	return notes;
};

const readNotes = (): StudyNote[] => {
	const value = localStorage.getItem(vaultStorageKey());
	if (value === null) return [];
	return parseNotes(value);
};

const writeNotes = (notes: StudyNote[]): void => {
	localStorage.setItem(vaultStorageKey(), JSON.stringify(notes));
};

export const listNotes = async (): Promise<NoteLibrary> => ({
	notes: readNotes().sort((a, b) => b.updatedAt - a.updatedAt),
	issues: [],
});

export const createNote = async (title: string): Promise<StudyNote> => {
	const existingNotes = readNotes();
	if (!isNoteTitleAvailable(existingNotes, title)) throw new Error("DUPLICATE_TITLE");

	const note: StudyNote = {
		id: createUuidV7(),
		title,
		document: createEmptyDocument(),
		updatedAt: Date.now(),
		preview: "",
	};
	writeNotes([note, ...existingNotes]);
	return note;
};

export const renameNote = async (noteId: string, title: string): Promise<StudyNote[]> => {
	const currentNotes = readNotes();
	const current = currentNotes.find((note) => note.id === noteId);
	if (!current) throw new Error("NOTE_NOT_FOUND");
	if (!isNoteTitleAvailable(currentNotes, title, noteId)) throw new Error("DUPLICATE_TITLE");
	if (current.title === title) return [];

	const changedAt = Date.now();
	const changedNotes = currentNotes.map((note) => {
		const document = renameResolvedNoteLinks(note.document, current.title, title, currentNotes, noteId);
		if (note.id === noteId) {
			return {
				...note,
				title,
				document,
				preview: documentPreview(document),
				updatedAt: changedAt,
			};
		}
		if (document === note.document) return note;
		return {
			...note,
			document,
			preview: documentPreview(document),
			updatedAt: changedAt,
		};
	});

	writeNotes(changedNotes);
	const changedIds = new Set(
		changedNotes.filter((note, index) => note !== currentNotes[index]).map((note) => note.id),
	);
	return changedNotes.filter((note) => changedIds.has(note.id));
};

export const saveNote = async (note: StudyNote): Promise<NoteSaveResult> => {
	const existingNotes = readNotes();
	const existing = existingNotes.find((item) => item.id === note.id);
	if (
		existing &&
		normalizeNoteTitle(existing.title) !== normalizeNoteTitle(note.title) &&
		!isNoteTitleAvailable(existingNotes, note.title, note.id)
	) {
		throw new Error("DUPLICATE_TITLE");
	}

	const saved: StudyNote = {
		...note,
		preview: documentPreview(note.document),
		updatedAt: Date.now(),
	};
	const notes = existingNotes.filter((item) => item.id !== saved.id);
	writeNotes([saved, ...notes]);
	return { note: saved, cleanupIssues: [] };
};

const deletedStorageKey = (): string => `${vaultStorageKey()}:deleted`;

export const listDeletedNotes = async (): Promise<StudyNote[]> => {
	const serialized = localStorage.getItem(deletedStorageKey());
	return serialized ? parseNotes(serialized) : [];
};

export const restoreDeletedNote = async (noteId: string): Promise<NoteSaveResult> => {
	const deleted = await listDeletedNotes();
	const note = deleted.find((item) => item.id === noteId);
	if (!note) throw new Error("NOTE_NOT_FOUND");
	const existing = readNotes();
	if (existing.some((item) => item.id === noteId)) throw new Error("NOTE_ALREADY_EXISTS");
	if (!isNoteTitleAvailable(existing, note.title)) throw new Error("DUPLICATE_TITLE");
	const result = await saveNote(note);
	try { localStorage.setItem(deletedStorageKey(), JSON.stringify(deleted.filter((item) => item.id !== noteId))); }
	catch (error) { console.error(error); }
	return result;
};

export const deleteNote = async (noteId: string): Promise<NoteLoadIssue[]> => {
	const existing = readNotes();
	const note = existing.find((item) => item.id === noteId);
	if (!note) throw new Error("NOTE_NOT_FOUND");
	const deleted = await listDeletedNotes();
	localStorage.setItem(deletedStorageKey(), JSON.stringify([
		{ ...note, updatedAt: Date.now() }, ...deleted.filter((item) => item.id !== noteId),
	].slice(0, 100)));
	writeNotes(existing.filter((note) => note.id !== noteId));
	return [];
};

export const getBrowserNotesStats = (vaultId: string): NoteStorageStats => {
	const serialized = localStorage.getItem(notesStorageKey(vaultId));
	if (!serialized) {
		return {
			noteCount: 0,
			imageCount: 0,
			audioCount: 0,
			videoCount: 0,
			characterCount: 0,
			storageBytes: 0,
			lastModifiedAt: 0,
		};
	}

	try {
		const notes = parseNotes(serialized);
		const imageIds = new Set<string>();
		const audioIds = new Set<string>();
		const videoIds = new Set<string>();
		let characterCount = 0;
		for (const note of notes) {
			for (const element of note.document.elements) {
				if (element.type === "image") {
					imageIds.add(element.imageId ?? element.id);
				}
				if (element.type === "audio") {
					audioIds.add(element.audioId ?? element.id);
				}
				if (element.type === "video") {
					videoIds.add(element.videoId ?? element.id);
				}
				if (element.type === "text") characterCount += [...element.text].length;
			}
		}
		return {
			noteCount: notes.length,
			imageCount: imageIds.size,
			audioCount: audioIds.size,
			videoCount: videoIds.size,
			characterCount,
			storageBytes: new Blob([serialized]).size,
			lastModifiedAt: notes.reduce((latest, note) => Math.max(latest, note.updatedAt), 0),
		};
	} catch {
		return {
			noteCount: 0,
			imageCount: 0,
			audioCount: 0,
			videoCount: 0,
			characterCount: 0,
			storageBytes: 0,
			lastModifiedAt: 0,
		};
	}
};

export const deleteBrowserNotesForVault = (vaultId: string): void => {
	localStorage.removeItem(notesStorageKey(vaultId));
	localStorage.removeItem(`${notesStorageKey(vaultId)}:deleted`);
};
