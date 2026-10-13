import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import {
	createNote as createNoteRecord,
	deleteNote as deleteNoteRecord,
	listNotes,
	renameNote as renameNoteRecord,
	saveNote,
	setNotesVaultId,
} from "../api/notes.repository";
import type { NoteLoadIssue, StudyNote } from "./note";
import { documentPreview, type NoteDocument } from "./note-document";
import { isNoteTitleAvailable } from "./note-titles";

export const useNotes = (activeVaultId: Accessor<string | undefined>) => {
	const [notes, setNotes] = createSignal<StudyNote[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [hasLoadedVault, setHasLoadedVault] = createSignal(false);
	const [saveError, setSaveError] = createSignal(false);
	const [loadIssues, setLoadIssues] = createSignal<NoteLoadIssue[]>([]);
	const sortedNotes = createMemo(() => [...notes()].sort((a, b) => b.updatedAt - a.updatedAt));

	const pendingSaves = new Map<string, StudyNote>();
	const notesByVault = new Map<string, { notes: StudyNote[]; issues: NoteLoadIssue[] }>();
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveQueue: Promise<void> = Promise.resolve();
	let activeFlush: Promise<boolean> | undefined;
	let loadedVaultId: string | undefined;

	createEffect(() => {
		const currentNotes = notes();
		const currentIssues = loadIssues();
		if (loadedVaultId) notesByVault.set(loadedVaultId, { notes: currentNotes, issues: currentIssues });
	});

	let loadRevision = 0;
	createEffect(() => {
		const vaultId = activeVaultId();
		setNotesVaultId(vaultId);
		const revision = ++loadRevision;
		setSaveError(false);
		if (!vaultId) {
			loadedVaultId = undefined;
			setNotes([]);
			setLoadIssues([]);
			setLoading(false);
			return;
		}

		const cached = notesByVault.get(vaultId);
		if (cached) {
			loadedVaultId = vaultId;
			setNotes(cached.notes);
			setLoadIssues(cached.issues);
			setLoading(false);
			setHasLoadedVault(true);
			return;
		}

		loadedVaultId = undefined;
		setNotes([]);
		setLoadIssues([]);
		setLoading(true);
		void listNotes()
			.then((library) => {
				if (revision !== loadRevision) return;
				loadedVaultId = vaultId;
				setNotes(library.notes);
				setLoadIssues(library.issues);
				notesByVault.set(vaultId, { notes: library.notes, issues: library.issues });
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
				reportCleanupIssues(result.cleanupIssues);
				if (pendingSaves.size === 0) setSaveError(false);
			} catch (error) {
				if (!pendingSaves.has(note.id)) pendingSaves.set(note.id, note);
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
				await saveQueue;
				if (saveTimer !== undefined) {
					clearTimeout(saveTimer);
					saveTimer = undefined;
				}

				const pending = [...pendingSaves.values()];
				if (pending.length === 0) return true;

				for (const note of pending) {
					if (pendingSaves.get(note.id) === note) pendingSaves.delete(note.id);
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

	const remove = async (note: StudyNote): Promise<void> => {
		if (!(await flushSave())) return;
		await saveQueue;
		try {
			const cleanupIssues = await deleteNoteRecord(note.id);
			setNotes((current) => current.filter((item) => item.id !== note.id));
			reportCleanupIssues(cleanupIssues);
		} catch (error) {
			console.error(error);
		}
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

	return {
		notes,
		sortedNotes,
		loading,
		hasLoadedVault,
		saveError,
		loadIssues,
		dismissLoadIssues: () => setLoadIssues([]),
		flushSave,
		create,
		rename,
		remove,
		updateDocument,
	};
};

export type NotesLibrary = ReturnType<typeof useNotes>;
