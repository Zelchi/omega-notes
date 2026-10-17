import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import {
	createNote as createNoteRecord,
	deleteNote as deleteNoteRecord,
	listNotes,
	listDeletedNotes,
	restoreDeletedNote,
	renameNote as renameNoteRecord,
	saveNote,
	setNotesVaultId,
} from "../api/notes.repository";
import type { NoteLoadIssue, StudyNote } from "./note";
import { documentPreview, type NoteDocument } from "./note-document";
import { isNoteTitleAvailable } from "./note-titles";
import type { NoteLinkPatch } from "./note-link-patch";

const documentSignature = (document: NoteDocument): string => JSON.stringify(document, (_key, value: unknown) => {
	if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
	return value;
});

export const useNotes = (activeVaultId: Accessor<string | undefined>) => {
	const [notes, setNotes] = createSignal<StudyNote[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [hasLoadedVault, setHasLoadedVault] = createSignal(false);
	const [saveError, setSaveError] = createSignal(false);
	const [loadIssues, setLoadIssues] = createSignal<NoteLoadIssue[]>([]);
	const [referenceTitles, setReferenceTitles] = createSignal<Record<string, string>>({});
	const sortedNotes = createMemo(() => [...notes()].sort((a, b) => b.updatedAt - a.updatedAt));

	const pendingSaves = new Map<string, StudyNote>();
	// Retain the newest revision even after it has left pendingSaves for the write queue.
	const latestSaves = new Map<string, StudyNote>();
	const notesByVault = new Map<string, { notes: StudyNote[]; issues: NoteLoadIssue[]; referenceTitles: Record<string, string> }>();
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveQueue: Promise<void> = Promise.resolve();
	let activeFlush: Promise<boolean> | undefined;
	let loadedVaultId: string | undefined;

	createEffect(() => {
		const currentNotes = notes();
		const currentIssues = loadIssues();
		const titles = referenceTitles();
		if (loadedVaultId) notesByVault.set(loadedVaultId, { notes: currentNotes, issues: currentIssues, referenceTitles: titles });
	});

	let loadRevision = 0;
	createEffect(() => {
		const vaultId = activeVaultId();
		setNotesVaultId(vaultId);
		const revision = ++loadRevision;
		setSaveError(false);
		setHasLoadedVault(false);
		if (!vaultId) {
			loadedVaultId = undefined;
			setNotes([]);
			setLoadIssues([]);
			setReferenceTitles({});
			setLoading(false);
			return;
		}

		const cached = notesByVault.get(vaultId);
		if (cached) {
			loadedVaultId = vaultId;
			setNotes(cached.notes);
			setLoadIssues(cached.issues);
			setReferenceTitles(cached.referenceTitles);
			setLoading(false);
			setHasLoadedVault(true);
			return;
		}

		loadedVaultId = undefined;
		setNotes([]);
		setLoadIssues([]);
		setReferenceTitles({});
		setLoading(true);
		void listNotes()
			.then((library) => {
				if (revision !== loadRevision) return;
				loadedVaultId = vaultId;
				setNotes(library.notes);
				setLoadIssues(library.issues);
				setReferenceTitles(library.referenceTitles);
				notesByVault.set(vaultId, { notes: library.notes, issues: library.issues, referenceTitles: library.referenceTitles });
				setHasLoadedVault(true);
			})
			.catch((error) => {
				if (revision !== loadRevision) return;
				console.error(error);
				loadedVaultId = undefined;
				setNotes([]);
				setLoadIssues([
					{
						fileName: "Notas",
						message: String(error),
						recoveryPath: null,
						recovered: false,
					},
				]);
			})
			.finally(() => {
				if (revision === loadRevision) setLoading(false);
			});
	});

	onCleanup(() => {
		if (saveTimer !== undefined) clearTimeout(saveTimer);
		++loadRevision;
	});

	const persist = (note: StudyNote): Promise<void> => {
		const operation = saveQueue.then(async () => {
			try {
				const result = await saveNote(note);
				const saved = result.note;
				setNotes((current) =>
					current.map((item) =>
						item.id === saved.id && item.title === note.title && item.document === note.document
							? saved
							: item,
					),
				);
				if (latestSaves.get(note.id) === note) latestSaves.delete(note.id);
				reportCleanupIssues(result.cleanupIssues);
				if (pendingSaves.size === 0) setSaveError(false);
			} catch (error) {
				if (latestSaves.get(note.id) === note && !pendingSaves.has(note.id)) pendingSaves.set(note.id, note);
				setSaveError(true);
				throw error;
			}
		});
		saveQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	};

	const flushPendingSaves = async (): Promise<boolean> => {
		try {
			while (true) {
				if (saveTimer !== undefined) {
					clearTimeout(saveTimer);
					saveTimer = undefined;
				}
				const queued = saveQueue;
				await queued;
				if (queued !== saveQueue) continue;
				if (saveTimer !== undefined) {
					clearTimeout(saveTimer);
					saveTimer = undefined;
				}

				const pending = [...pendingSaves.values()];
				if (pending.length === 0) return true;

				for (const note of pending) {
					if (pendingSaves.get(note.id) !== note) continue;
					pendingSaves.delete(note.id);
					await persist(note);
				}
			}
		} catch (error) {
			console.error(error);
			setSaveError(true);
			return false;
		}
	};

	const flushSave = (): Promise<boolean> => {
		if (activeFlush) return activeFlush;
		activeFlush = flushPendingSaves().finally(() => {
			activeFlush = undefined;
		});
		return activeFlush;
	};

	const queueSave = (note: StudyNote): void => {
		setNotes((current) => current.map((item) => (item.id === note.id ? note : item)));
		latestSaves.set(note.id, note);
		pendingSaves.set(note.id, note);
		if (saveTimer !== undefined) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			const pending = [...pendingSaves.values()];
			pending.forEach((item) => pendingSaves.delete(item.id));
			for (const item of pending) void persist(item).catch(() => undefined);
		}, 500);
	};

	const create = async (title: string): Promise<StudyNote> => {
		if (!isNoteTitleAvailable(notes(), title)) throw new Error("DUPLICATE_TITLE");
		const note = await createNoteRecord(title);
		setNotes((current) => [note, ...current]);
		return note;
	};

	const rename = async (note: StudyNote, title: string): Promise<boolean> => {
		if (!(await flushSave())) return false;
		await saveQueue;
		const currentNote = notes().find((item) => item.id === note.id);
		if (!currentNote) return false;
		if (!isNoteTitleAvailable(notes(), title, currentNote.id)) throw new Error("DUPLICATE_TITLE");

		const changedNotes = await renameNoteRecord(currentNote.id, title);
		if (changedNotes.length) {
			const changedById = new Map(changedNotes.map((item) => [item.id, item]));
			setNotes((current) => current.map((item) => changedById.get(item.id) ?? item));
		}
		return true;
	};

	const remove = async (note: StudyNote): Promise<boolean> => {
		const vaultId = activeVaultId();
		if (!(await flushSave()) || vaultId !== activeVaultId()) return false;
		await saveQueue;
		const cleanupIssues = await deleteNoteRecord(note.id);
		const deleted = notes().find((item) => item.id === note.id) ?? note;
		setReferenceTitles((current) => ({ ...current, [note.id]: deleted.title }));
		setNotes((current) => current.filter((item) => item.id !== note.id));
		reportCleanupIssues(cleanupIssues);
		return true;
	};

	const restore = async (noteId: string): Promise<StudyNote> => {
		const vaultId = activeVaultId();
		if (!(await flushSave()) || vaultId !== activeVaultId()) throw new Error("SAVE_FAILED");
		await saveQueue;
		const result = await restoreDeletedNote(noteId);
		setNotes((current) => [result.note, ...current.filter((note) => note.id !== noteId)]);
		reportCleanupIssues(result.cleanupIssues);
		return result.note;
	};

	const reportCleanupIssues = (issues: NoteLoadIssue[]): void => {
		if (!issues.length) return;
		setLoadIssues((current) => {
			const known = new Set(current.map((issue) => `${issue.fileName}:${issue.message}`));
			return [...current, ...issues.filter((issue) => !known.has(`${issue.fileName}:${issue.message}`))];
		});
	};

	const updateDocument = (noteId: string, document: NoteDocument): void => {
		const current = notes().find((note) => note.id === noteId);
		if (!current) return;
		queueSave({ ...current, document, preview: documentPreview(document), updatedAt: Date.now() });
	};

	const applyLinkedMentions = async (patch: NoteLinkPatch, stillValid: () => boolean): Promise<() => Promise<void>> => {
		const vaultId = activeVaultId();
		if (!(await flushSave())) throw "AI_SAVE_FAILED";
		if (!vaultId || vaultId !== activeVaultId()) throw "AI_VAULT_CHANGED";
		if (!stillValid()) throw "AI_CANCELLED";
		const current = notes().find((note) => note.id === patch.noteId);
		if (!current || current.title !== patch.title || documentSignature(current.document) !== documentSignature(patch.expectedDocument)) throw "AI_NOTE_CHANGED";
		if (patch.links.some((link) => !notes().some((note) => note.id === link.id))) throw "AI_NOTE_CHANGED";
		const before = new Map(current.document.elements.filter((element) => element.type === "text").map((element) => [element.id, element.text]));
		const after = new Map(patch.document.elements.flatMap((element) => element.type === "text" && before.get(element.id) !== element.text ? [[element.id, element.text] as const] : []));
		updateDocument(current.id, { ...current.document, elements: current.document.elements.map((element) => element.type === "text" && after.has(element.id) ? { ...element, text: after.get(element.id)! } : element) });
		if (!(await flushSave())) throw "AI_SAVE_FAILED";
		return async () => {
			if (vaultId !== activeVaultId()) throw "AI_VAULT_CHANGED";
			if (!(await flushSave())) throw "AI_SAVE_FAILED";
			if (vaultId !== activeVaultId()) throw "AI_VAULT_CHANGED";
			const latest = notes().find((note) => note.id === patch.noteId);
			if (!latest || [...after].some(([id, text]) => !latest.document.elements.some((element) => element.id === id && element.type === "text" && element.text === text))) throw "AI_NOTE_CHANGED";
			updateDocument(latest.id, { ...latest.document, elements: latest.document.elements.map((element) => element.type === "text" && after.has(element.id) ? { ...element, text: before.get(element.id)! } : element) });
			if (!(await flushSave())) throw "AI_SAVE_FAILED";
		};
	};

	return {
		notes,
		sortedNotes,
		loading,
		hasLoadedVault,
		saveError,
		loadIssues,
		referenceTitles,
		dismissLoadIssues: () => setLoadIssues([]),
		flushSave,
		create,
		rename,
		remove,
		restore,
		listDeleted: listDeletedNotes,
		updateDocument,
		applyLinkedMentions,
	};
};

export type NotesLibrary = ReturnType<typeof useNotes>;
