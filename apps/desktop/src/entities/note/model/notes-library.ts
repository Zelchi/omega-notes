import { isTauriRuntime } from "@/shared/lib/tauri";
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import {
	createNote as createNoteRecord,
	deleteNote as deleteNoteRecord,
	listNotes,
	notesRevision,
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

export const useNotes = (activeVaultId: Accessor<string | undefined>, observeExternal: Accessor<boolean> = () => false) => {
	const [notes, setNotes] = createSignal<StudyNote[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [hasLoadedVault, setHasLoadedVault] = createSignal(false);
	const [saveError, setSaveError] = createSignal(false);
	const [loadIssues, setLoadIssues] = createSignal<NoteLoadIssue[]>([]);
	const [referenceTitles, setReferenceTitles] = createSignal<Record<string, string>>({});
	const sortedNotes = createMemo(() => [...notes()].sort((a, b) => b.updatedAt - a.updatedAt));

	const pendingSaves = new Map<string, StudyNote>();
	const latestSaves = new Map<string, StudyNote>();
	const baselines = new Map<string, StudyNote>();
	const [conflicts, setConflicts] = createSignal<string[]>([]);
	const [resolvingConflict, setResolvingConflict] = createSignal(false);
	const sameNote = (a: StudyNote | undefined, b: StudyNote | undefined) => a === b || !!a && !!b && a.title === b.title && documentSignature(a.document) === documentSignature(b.document);
	const conflict = (id: string) => setConflicts(ids => ids.includes(id) ? ids : [...ids, id]);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveQueue: Promise<void> = Promise.resolve();
	let activeFlush: Promise<boolean> | undefined;
	let loadedVaultId: string | undefined;


	let changeRevision = 0;
	let loadRevision = 0;
	createEffect(() => {
		const vaultId = activeVaultId();
		setNotesVaultId(vaultId);
		const revision = ++loadRevision;
		baselines.clear(); setConflicts([]);
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

		loadedVaultId = undefined;
		setNotes([]);
		setLoadIssues([]);
		setReferenceTitles({});
		setLoading(true);
		void listNotes(vaultId, untrack(observeExternal))
			.then((library) => {
				if (revision !== loadRevision) return;
				loadedVaultId = vaultId;
				setNotes(library.notes);
				setLoadIssues(library.issues);
				setReferenceTitles(library.referenceTitles);
				library.notes.forEach(note => baselines.set(note.id, note));
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
		const vaultId = activeVaultId();
		const operation = saveQueue.then(async () => {
			if (latestSaves.get(note.id) !== note) return;
			if (resolvingConflict()) { pendingSaves.set(note.id, note); return; }
			try {
				if (!vaultId || vaultId !== activeVaultId()) throw Error("AI_VAULT_CHANGED");
				const expected = baselines.get(note.id);
				if (!expected || conflicts().includes(note.id)) throw Error("NOTE_EXTERNAL_CONFLICT");
				const result = await saveNote(note, expected, vaultId);
				const saved = result.note;
				++changeRevision;
				baselines.set(saved.id, saved);
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
				if (String(error).includes("NOTE_EXTERNAL_CONFLICT")) conflict(note.id);
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
		if (resolvingConflict()) return false;
		try {
			while (true) {
				if (resolvingConflict()) return false;
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
		++changeRevision;
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

	let refreshing = false;
	const mergeExternal = (library: Awaited<ReturnType<typeof listNotes>>) => {
		const local = new Map(notes().map(note => [note.id, note]));
		const external = new Map(library.notes.map(note => [note.id, note]));
		const next = library.notes.map(note => {
			const current = local.get(note.id);
			if (latestSaves.has(note.id)) {
				if (!sameNote(baselines.get(note.id), note)) conflict(note.id);
				return current ?? note;
			}
			baselines.set(note.id, note);
			return sameNote(current, note) ? current! : note;
		});
		for (const note of local.values()) {
			if (external.has(note.id)) continue;
			if (latestSaves.has(note.id)) { conflict(note.id); next.push(note); }
			else baselines.delete(note.id);
		}
		setNotes(next); setReferenceTitles(library.referenceTitles); setLoadIssues(library.issues);
	};
	createEffect(() => {
		const vaultId = activeVaultId(), enabled = observeExternal();
		if (!enabled || !vaultId || !isTauriRuntime()) return;
		let stopped = false, stamp: string | undefined, candidate: string | undefined;
		const refresh = async () => {
			if (stopped || refreshing || resolvingConflict() || loading() || loadedVaultId !== vaultId || document.hidden) return;
			refreshing = true;
			const revision = changeRevision;
			try {
				await saveQueue;
				const current = await notesRevision(vaultId);
				if (stopped || vaultId !== activeVaultId()) return;
				if (current === stamp) return;
				if (candidate !== current) { candidate = current; return; }
				const library = await listNotes(vaultId, true);
				if (stopped || resolvingConflict() || vaultId !== activeVaultId() || revision !== changeRevision) return;
				mergeExternal(library); stamp = current;
			} catch { }
			finally { refreshing = false; }
		};
		const timer = setInterval(() => { void refresh(); }, 2000);
		const focus = () => { void refresh(); };
		window.addEventListener("focus", focus);
		void refresh();
		onCleanup(() => { stopped = true; clearInterval(timer); window.removeEventListener("focus", focus); });
	});
	const resolveConflict = async (id: string, keepLocal: boolean, suffix: string) => {
		const vaultId = activeVaultId();
		if (!vaultId || resolvingConflict()) return;
		setResolvingConflict(true);
		try {
			await saveQueue;
			const local = notes().find(note => note.id === id);
			if (!local || !conflicts().includes(id)) return;
			const external = await listNotes(vaultId, true);
			if (vaultId !== activeVaultId()) return;
			if (keepLocal) {
				++changeRevision;
				let title = `${local.title.slice(0, 60)} ${suffix}`, number = 2;
				while (!isNoteTitleAvailable([...notes(), ...external.notes], title)) title = `${local.title.slice(0, 60)} ${suffix} ${number++}`;
				const created = await createNoteRecord(title);
				if (vaultId !== activeVaultId()) return;
				const saved = await saveNote({ ...created, document: local.document }, created, vaultId);
				++changeRevision;
				baselines.set(saved.note.id, saved.note);
				setNotes(notes => [saved.note, ...notes.filter(note => note.id !== saved.note.id)]);
			}
			const revision = changeRevision;
			const latestExternal = await listNotes(vaultId, true);
			if (revision !== changeRevision) return;
			if (vaultId !== activeVaultId() || !sameNote(notes().find(note => note.id === id), local)) return;
			++changeRevision;
			pendingSaves.delete(id); latestSaves.delete(id);
			setConflicts(ids => ids.filter(value => value !== id));
			mergeExternal(latestExternal);
			if (!pendingSaves.size) setSaveError(false);
		} catch (error) { console.error(error); setSaveError(true); }
		finally {
			setResolvingConflict(false);
			for (const note of pendingSaves.values()) {
				if (conflicts().includes(note.id)) continue;
				pendingSaves.delete(note.id);
				void persist(note).catch(() => undefined);
			}
		}
	};

	const create = async (title: string): Promise<StudyNote> => {
		if (!isNoteTitleAvailable(notes(), title)) throw new Error("DUPLICATE_TITLE");
		++changeRevision;
		const note = await createNoteRecord(title);
		++changeRevision;
		baselines.set(note.id, note);
		setNotes((current) => [note, ...current]);
		return note;
	};

	const rename = async (note: StudyNote, title: string): Promise<boolean> => {
		if (!(await flushSave())) return false;
		await saveQueue;
		const currentNote = notes().find((item) => item.id === note.id);
		if (!currentNote) return false;
		if (!isNoteTitleAvailable(notes(), title, currentNote.id)) throw new Error("DUPLICATE_TITLE");

		++changeRevision;
		const changedNotes = await renameNoteRecord(currentNote.id, title);
		++changeRevision;
		if (changedNotes.length) {
			changedNotes.forEach(note => baselines.set(note.id, note));
			const changedById = new Map(changedNotes.map((item) => [item.id, item]));
			setNotes((current) => current.map((item) => changedById.get(item.id) ?? item));
		}
		return true;
	};

	const remove = async (note: StudyNote): Promise<boolean> => {
		const vaultId = activeVaultId();
		if (!(await flushSave()) || vaultId !== activeVaultId()) return false;
		await saveQueue;
		++changeRevision;
		const cleanupIssues = await deleteNoteRecord(note.id);
		++changeRevision;
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
		++changeRevision;
		const result = await restoreDeletedNote(noteId);
		++changeRevision;
		baselines.set(result.note.id, result.note);
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
		applyLinkedMentions, conflicts, resolvingConflict, resolveConflict,
	};
};

export type NotesLibrary = ReturnType<typeof useNotes>;
