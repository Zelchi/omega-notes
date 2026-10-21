import { createUuidV7 } from "@/shared/lib/ids";
import type { NoteChangeSet, NoteLibrary, NoteLoadIssue, NoteSaveResult, NoteStorageStats, NoteSummary, NoteSummaryLibrary, StudyNote } from "../model/note";
import { createEmptyDocument, documentPreview } from "../model/note-document";
import { summarizeNote } from "../model/note-summary";
import { renameResolvedNoteLinks } from "../model/note-links";
import { NOTE_TITLE_MAX_LENGTH } from "../model/note-titles";

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

const referenceTitlesKey = (): string => `${vaultStorageKey()}:reference-titles`;
const readReferenceTitles = (): Record<string, string> => {
	const stored = localStorage.getItem(referenceTitlesKey());
	if (!stored) return {};
	const parsed: unknown = JSON.parse(stored);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) throw new Error("INVALID_REFERENCE_TITLES");
	return parsed as Record<string, string>;
};

export const listNotes = async (): Promise<NoteLibrary> => {
	const notes = readNotes().sort((a, b) => b.updatedAt - a.updatedAt);
	const issues: NoteLoadIssue[] = [];
	let referenceTitles: Record<string, string> = {};
	let writable = true;
	const report = (error: unknown) => issues.push({ fileName: "reference-titles", message: String(error), recoveryPath: null, recovered: false });
	try { referenceTitles = readReferenceTitles(); }
	catch (error) { writable = false; report(error); }
	let changed = false;
	try {
		for (const note of await listDeletedNotes()) if (!Object.hasOwn(referenceTitles, note.id)) { referenceTitles[note.id] = note.title; changed = true; }
	} catch (error) { report(error); }
	if (writable && changed) {
		try { localStorage.setItem(referenceTitlesKey(), JSON.stringify(referenceTitles)); }
		catch (error) { report(error); }
	}
	return { notes, issues, referenceTitles };
};

export const streamNoteSummaries = async (
	_onVaultId: string,
	_observerId: string,
	_onExternal: boolean,
	_resetObserverSnapshot: boolean,
	onItems: (notes: NoteSummary[]) => void,
): Promise<Omit<NoteSummaryLibrary, "notes">> => {
	const library = await listNotes();
	for (let offset = 0; offset < library.notes.length; offset += 32) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		onItems(library.notes.slice(offset, offset + 32).map(summarizeNote));
	}
	return { issues: library.issues, referenceTitles: library.referenceTitles };
};

export const notesChanges = async (_vaultId: string, _observerId: string): Promise<NoteChangeSet> => ({
	fullResync: false,
	changeToken: null,
	changedIds: [],
	removedIds: [],
	notes: [],
	issues: [],
	referenceTitles: {},
});

export const acknowledgeNoteChanges = async (_observerId: string, _changeToken: string): Promise<void> => undefined;

export const getNote = async (_vaultId: string, noteId: string): Promise<StudyNote> => {
	const note = readNotes().find((entry) => entry.id === noteId);
	if (!note) throw new Error("NOTE_NOT_FOUND");
	return note;
};

export const createNote = async (title: string): Promise<StudyNote> => {
	const existingNotes = readNotes();
	if (title.trim().length > NOTE_TITLE_MAX_LENGTH) throw new Error("TITLE_TOO_LONG");

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
	if (title.trim().length > NOTE_TITLE_MAX_LENGTH) throw new Error("TITLE_TOO_LONG");
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

export const listDeletedNoteIds = async (): Promise<string[]> => (await listDeletedNotes()).map((note) => note.id);

export const restoreDeletedNote = async (noteId: string): Promise<NoteSaveResult> => {
	const deleted = await listDeletedNotes();
	const note = deleted.find((item) => item.id === noteId);
	if (!note) throw new Error("NOTE_NOT_FOUND");
	const existing = readNotes();
	if (existing.some((item) => item.id === noteId)) throw new Error("NOTE_ALREADY_EXISTS");
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
	localStorage.setItem(referenceTitlesKey(), JSON.stringify({ ...readReferenceTitles(), [note.id]: note.title }));
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
	localStorage.removeItem(`${notesStorageKey(vaultId)}:reference-titles`);
};
