import { isTauriRuntime } from "@/shared/lib/tauri";
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import {
	createNote as createNoteRecord,
	deleteNote as deleteNoteRecord,
	getNote as getNoteRecord,
	acknowledgeNoteChanges,
	notesChanges,
	listDeletedNoteIds,
	restoreDeletedNote,
	renameNote as renameNoteRecord,
	saveNote,
	setNotesVaultId,
	streamNoteSummaries,
} from "../api/notes.repository";
import type { NoteChangeSet, NoteLoadIssue, NoteSummary, StudyNote } from "./note";
import { summarizeNote } from "./note-summary";
import { documentPreview, type NoteDocument } from "./note-document";
import { withDocumentReadSlot } from "./document-read-limiter";
import { isNoteTitleAvailable } from "./note-titles";
import type { NoteLinkPatch } from "./note-link-patch";

const documentSignature = (document: NoteDocument): string => JSON.stringify(document, (_key, value: unknown) => {
	if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
	return value;
});

export const useNotes = (activeVaultId: Accessor<string | undefined>, observeExternal: Accessor<boolean> = () => false) => {
	const observerId = crypto.randomUUID();
	const [notes, setNotes] = createSignal<NoteSummary[]>([], { equals: false });
	const [loadedNotes, setLoadedNotes] = createSignal<Map<string, StudyNote>>(new Map());
	const [loading, setLoading] = createSignal(true);
	const [hasLoadedVault, setHasLoadedVault] = createSignal(false);
	const [saveError, setSaveError] = createSignal(false);
	const [loadIssues, setLoadIssues] = createSignal<NoteLoadIssue[]>([]);
	const [referenceTitles, setReferenceTitles] = createSignal<Record<string, string>>({});
	const sortedNotes = createMemo(() => [...notes()].sort((a, b) => b.updatedAt - a.updatedAt));
	const fullNotes = createMemo(() => [...loadedNotes().values()]);

	const pendingSaves = new Map<string, StudyNote>();
	const latestSaves = new Map<string, StudyNote>();
	const pendingLoads = new Map<string, Promise<StudyNote>>();
	const baselines = new Map<string, StudyNote>();
	const [conflicts, setConflicts] = createSignal<string[]>([]);
	const [resolvingConflict, setResolvingConflict] = createSignal(false);
	const sameNote = (a: StudyNote | undefined, b: StudyNote | undefined) => a === b || !!a && !!b && a.title === b.title && documentSignature(a.document) === documentSignature(b.document);
	const sameSummary = (a: NoteSummary | undefined, b: NoteSummary | undefined) => a === b || !!a && !!b &&
		a.title === b.title && a.preview === b.preview && a.updatedAt === b.updatedAt &&
		a.hasContent === b.hasContent && a.hasText === b.hasText && a.links.join("\0") === b.links.join("\0");
	const readSummaryLibrary = async (vaultId: string, external: boolean, resetObserverSnapshot = true) => {
		const summaries: NoteSummary[] = [];
		const completion = await streamNoteSummaries(vaultId, observerId, external, resetObserverSnapshot, (batch) => summaries.push(...batch));
		return { ...completion, notes: summaries };
	};
	const readExternalDocuments = async (vaultId: string, summaries: NoteSummary[], changedIds: string[] = [], reconcileLoaded = false): Promise<Map<string, StudyNote>> => {
		const local = new Map(notes().map((note) => [note.id, note]));
		const forced = new Set(changedIds);
		const ids = summaries.filter((summary) => {
			const changed = !sameSummary(local.get(summary.id), summary);
			return latestSaves.has(summary.id) || (reconcileLoaded || changed || forced.has(summary.id)) && loadedNotes().has(summary.id);
		}).map((summary) => summary.id);
		const documents = new Map<string, StudyNote>();
		let cursor = 0;
		const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
			while (cursor < ids.length) {
				const id = ids[cursor++];
				try { documents.set(id, await withDocumentReadSlot(() => getNoteRecord(vaultId, id))); }
				catch { /* The file may have changed again while the summary stream was running. */ }
			}
		});
		await Promise.all(workers);
		return documents;
	};
	const putLoaded = (note: StudyNote): void => {
		setLoadedNotes((current) => new Map(current).set(note.id, note));
		baselines.set(note.id, note);
	};
	const updateSummary = (note: NoteSummary): void => {
		setNotes((current) => {
			const index = current.findIndex((item) => item.id === note.id);
			if (index < 0) return [note, ...current];
			if (sameSummary(current[index], note)) return current;
			const next = [...current];
			next[index] = note;
			return next;
		});
	};
	const loadNote = async (id: string): Promise<StudyNote> => {
		const cached = loadedNotes().get(id);
		if (cached) return cached;
		const vaultId = activeVaultId();
		if (!vaultId || !notes().some((note) => note.id === id)) throw new Error("NOTE_NOT_FOUND");
		const key = `${vaultId}\0${id}`;
		const pending = pendingLoads.get(key);
		if (pending) return pending;
		const request = withDocumentReadSlot(() => getNoteRecord(vaultId, id)).then((note) => {
			if (vaultId !== activeVaultId() || !notes().some((item) => item.id === id)) throw new Error("NOTE_LOAD_VAULT_CHANGED");
			const current = loadedNotes().get(id);
			if (current) return current;
			putLoaded(note);
			updateSummary(summarizeNote(note));
			return note;
		}).finally(() => {
			if (pendingLoads.get(key) === request) pendingLoads.delete(key);
		});
		pendingLoads.set(key, request);
		return request;
	};
	const loadAllNotes = async (): Promise<StudyNote[]> => {
		const summaries = notes();
		const loaded = new Array<StudyNote>(summaries.length);
		let cursor = 0;
		const workers = Array.from({ length: Math.min(4, summaries.length) }, async () => {
			while (cursor < summaries.length) {
				const index = cursor++;
				loaded[index] = await loadNote(summaries[index].id);
			}
		});
		await Promise.all(workers);
		return loaded;
	};
	const releaseLoadedNotes = (...keepIds: (string | undefined)[]): void => {
		const keep = new Set([...keepIds.filter((id): id is string => Boolean(id)), ...pendingSaves.keys(), ...latestSaves.keys()]);
		setLoadedNotes((current) => new Map([...current].filter(([id]) => keep.has(id))));
		for (const id of baselines.keys()) if (!keep.has(id)) baselines.delete(id);
	};
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
			setLoadedNotes(new Map());
			setLoadIssues([]);
			setReferenceTitles({});
			setLoading(false);
			return;
		}

		loadedVaultId = undefined;
		setNotes([]);
		setLoadedNotes(new Map());
		setLoadIssues([]);
		setReferenceTitles({});
		setLoading(true);
		const summaries: NoteSummary[] = [];
		void streamNoteSummaries(vaultId, observerId, untrack(observeExternal), true, (batch) => {
				if (revision !== loadRevision || !batch.length) return;
				summaries.push(...batch);
				setNotes(summaries);
				setHasLoadedVault(true);
			})
			.then((library) => {
				if (revision !== loadRevision) return;
				loadedVaultId = vaultId;
				summaries.sort((a, b) => b.updatedAt - a.updatedAt);
				setNotes(summaries);
				setLoadIssues(library.issues);
				setReferenceTitles(library.referenceTitles);
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
				if (!vaultId || vaultId !== activeVaultId()) throw Error("NOTE_SAVE_VAULT_CHANGED");
				const expected = baselines.get(note.id);
				if (!expected || conflicts().includes(note.id)) throw Error("NOTE_EXTERNAL_CONFLICT");
				const result = await saveNote(note, expected, vaultId);
				const saved = result.note;
				++changeRevision;
				baselines.set(saved.id, saved);
				setLoadedNotes((current) => new Map(current).set(saved.id, saved));
				updateSummary(summarizeNote(saved));
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
		setLoadedNotes((current) => new Map(current).set(note.id, note));
		updateSummary(summarizeNote(note));
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
	const mergeExternal = (
		library: Awaited<ReturnType<typeof readSummaryLibrary>>,
		externalDocuments: Map<string, StudyNote>,
	) => {
		const local = new Map(notes().map(note => [note.id, note]));
		const loaded = new Map(loadedNotes());
		const external = new Map(library.notes.map(note => [note.id, note]));
		const next = library.notes.map(summary => {
			const current = local.get(summary.id);
			const remoteDocument = externalDocuments.get(summary.id);
			if (latestSaves.has(summary.id)) {
				if (!remoteDocument || !sameNote(baselines.get(summary.id), remoteDocument)) conflict(summary.id);
				return current ?? summary;
			}
			if (loaded.has(summary.id) && remoteDocument) {
				const currentFull = loaded.get(summary.id);
				if (!sameNote(currentFull, remoteDocument)) loaded.set(summary.id, remoteDocument);
				baselines.set(summary.id, remoteDocument);
			}
			return sameSummary(current, summary) ? current! : summary;
		});
		for (const note of local.values()) {
			if (external.has(note.id)) continue;
			if (latestSaves.has(note.id)) { conflict(note.id); next.push(note); }
			else { baselines.delete(note.id); loaded.delete(note.id); }
		}
		setLoadedNotes(loaded);
		setNotes(next); setReferenceTitles(library.referenceTitles); setLoadIssues(library.issues);
	};
	const mergeExternalDelta = (changes: NoteChangeSet, externalDocuments: Map<string, StudyNote>) => {
		const updates = new Map(changes.notes.map((note) => [note.id, note]));
		const removed = new Set(changes.removedIds);
		const current = notes();
		const currentIds = new Set(current.map((note) => note.id));
		const loaded = new Map(loadedNotes());
		const next: NoteSummary[] = [];
		for (const summary of current) {
			if (removed.has(summary.id)) {
				if (latestSaves.has(summary.id)) {
					conflict(summary.id);
					next.push(summary);
				} else {
					baselines.delete(summary.id);
					loaded.delete(summary.id);
				}
				continue;
			}
			const external = updates.get(summary.id);
			if (!external) { next.push(summary); continue; }
			const remoteDocument = externalDocuments.get(summary.id);
			if (latestSaves.has(summary.id)) {
				if (!remoteDocument || !sameNote(baselines.get(summary.id), remoteDocument)) conflict(summary.id);
				next.push(summary);
				continue;
			}
			if (loaded.has(summary.id) && remoteDocument) {
				if (!sameNote(loaded.get(summary.id), remoteDocument)) loaded.set(summary.id, remoteDocument);
				baselines.set(summary.id, remoteDocument);
			}
			next.push(sameSummary(summary, external) ? summary : external);
		}
		for (const summary of changes.notes) {
			if (!currentIds.has(summary.id) && !removed.has(summary.id)) next.push(summary);
		}
		setLoadedNotes(loaded);
		setNotes(next);
		setReferenceTitles(changes.referenceTitles);
		setLoadIssues(changes.issues);
	};
	createEffect(() => {
		const vaultId = activeVaultId(), enabled = observeExternal();
		if (!enabled || !vaultId || !isTauriRuntime()) return;
		let stopped = false;
		const refresh = async () => {
			if (stopped || refreshing || resolvingConflict() || loading() || loadedVaultId !== vaultId || document.hidden) return;
			refreshing = true;
			const revision = changeRevision;
			try {
				await saveQueue;
				const changes = await notesChanges(vaultId, observerId);
				if (stopped || vaultId !== activeVaultId()) return;
				if (changes.fullResync) {
					const library = await readSummaryLibrary(vaultId, true, false);
					if (stopped || resolvingConflict() || vaultId !== activeVaultId() || revision !== changeRevision) return;
					const documents = await readExternalDocuments(vaultId, library.notes, changes.changedIds, true);
					if (stopped || resolvingConflict() || vaultId !== activeVaultId() || revision !== changeRevision) return;
					mergeExternal(library, documents);
					if (changes.changeToken) await acknowledgeNoteChanges(observerId, changes.changeToken);
					return;
				}
				if (!changes.changedIds.length && !changes.removedIds.length) return;
				const documents = await readExternalDocuments(vaultId, changes.notes, changes.changedIds);
				if (stopped || resolvingConflict() || vaultId !== activeVaultId() || revision !== changeRevision) return;
				mergeExternalDelta(changes, documents);
				if (changes.changeToken) await acknowledgeNoteChanges(observerId, changes.changeToken);
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
			const local = loadedNotes().get(id);
			if (!local || !conflicts().includes(id)) return;
			const external = await readSummaryLibrary(vaultId, true);
			if (vaultId !== activeVaultId()) return;
			if (keepLocal) {
				++changeRevision;
				let title = `${local.title.slice(0, 60)} ${suffix}`, number = 2;
				while (!isNoteTitleAvailable([...notes(), ...external.notes], title)) title = `${local.title.slice(0, 60)} ${suffix} ${number++}`;
				const created = await createNoteRecord(title);
				if (vaultId !== activeVaultId()) return;
				const saved = await saveNote({ ...created, document: local.document }, created, vaultId);
				++changeRevision;
				putLoaded(saved.note);
				updateSummary(summarizeNote(saved.note));
			}
			const revision = changeRevision;
			const latestExternal = await readSummaryLibrary(vaultId, true);
			const latestExternalDocuments = await readExternalDocuments(vaultId, latestExternal.notes);
			if (revision !== changeRevision) return;
			if (vaultId !== activeVaultId() || !sameNote(loadedNotes().get(id), local)) return;
			++changeRevision;
			pendingSaves.delete(id); latestSaves.delete(id);
			setConflicts(ids => ids.filter(value => value !== id));
			mergeExternal(latestExternal, latestExternalDocuments);
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
		putLoaded(note);
		updateSummary(summarizeNote(note));
		return note;
	};

	const rename = async (note: Pick<NoteSummary, "id">, title: string): Promise<boolean> => {
		if (!(await flushSave())) return false;
		await saveQueue;
		const currentNote = notes().find((item) => item.id === note.id);
		if (!currentNote) return false;
		if (!isNoteTitleAvailable(notes(), title, currentNote.id)) throw new Error("DUPLICATE_TITLE");

		++changeRevision;
		const changedNotes = await renameNoteRecord(currentNote.id, title);
		++changeRevision;
		if (changedNotes.length) {
			const loaded = new Map(loadedNotes());
			for (const changed of changedNotes) {
				updateSummary(summarizeNote(changed));
				if (loaded.has(changed.id)) {
					loaded.set(changed.id, changed);
					baselines.set(changed.id, changed);
				}
			}
			setLoadedNotes(loaded);
		}
		return true;
	};

	const remove = async (note: NoteSummary): Promise<boolean> => {
		const vaultId = activeVaultId();
		if (!(await flushSave()) || vaultId !== activeVaultId()) return false;
		await saveQueue;
		++changeRevision;
		const cleanupIssues = await deleteNoteRecord(note.id);
		++changeRevision;
		const deleted = notes().find((item) => item.id === note.id) ?? note;
		setReferenceTitles((current) => ({ ...current, [note.id]: deleted.title }));
		setNotes((current) => current.filter((item) => item.id !== note.id));
		setLoadedNotes((current) => { const next = new Map(current); next.delete(note.id); return next; });
		baselines.delete(note.id);
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
		putLoaded(result.note);
		updateSummary(summarizeNote(result.note));
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
		const current = loadedNotes().get(noteId);
		if (!current) return;
		queueSave({ ...current, document, preview: documentPreview(document), updatedAt: Date.now() });
	};

	const applyLinkedMentions = async (patch: NoteLinkPatch, stillValid: () => boolean): Promise<() => Promise<void>> => {
		const vaultId = activeVaultId();
		if (!(await flushSave())) throw "AI_SAVE_FAILED";
		if (!vaultId || vaultId !== activeVaultId()) throw "NOTE_LINK_VAULT_CHANGED";
		if (!stillValid()) throw "AI_CANCELLED";
		const current = loadedNotes().get(patch.noteId);
		if (!current || current.title !== patch.title || documentSignature(current.document) !== documentSignature(patch.expectedDocument)) throw "AI_NOTE_CHANGED";
		if (patch.links.some((link) => !notes().some((note) => note.id === link.id))) throw "AI_NOTE_CHANGED";
		const before = new Map(current.document.elements.filter((element) => element.type === "text").map((element) => [element.id, element.text]));
		const after = new Map(patch.document.elements.flatMap((element) => element.type === "text" && before.get(element.id) !== element.text ? [[element.id, element.text] as const] : []));
		updateDocument(current.id, { ...current.document, elements: current.document.elements.map((element) => element.type === "text" && after.has(element.id) ? { ...element, text: after.get(element.id)! } : element) });
		if (!(await flushSave())) throw "AI_SAVE_FAILED";
		return async () => {
			if (vaultId !== activeVaultId()) throw "NOTE_UNDO_LINKS_VAULT_CHANGED";
			if (!(await flushSave())) throw "AI_SAVE_FAILED";
			if (vaultId !== activeVaultId()) throw "NOTE_UNDO_LINKS_VAULT_CHANGED";
			const latest = loadedNotes().get(patch.noteId);
			if (!latest || [...after].some(([id, text]) => !latest.document.elements.some((element) => element.id === id && element.type === "text" && element.text === text))) throw "AI_NOTE_CHANGED";
			updateDocument(latest.id, { ...latest.document, elements: latest.document.elements.map((element) => element.type === "text" && after.has(element.id) ? { ...element, text: before.get(element.id)! } : element) });
			if (!(await flushSave())) throw "AI_SAVE_FAILED";
		};
	};

	return {
		notes,
		sortedNotes,
		loadedNotes: fullNotes,
		loadNote,
		loadAllNotes,
		releaseLoadedNotes,
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
		listDeleted: listDeletedNoteIds,
		updateDocument,
		applyLinkedMentions, conflicts, resolvingConflict, resolveConflict,
	};
};

export type NotesLibrary = ReturnType<typeof useNotes>;
