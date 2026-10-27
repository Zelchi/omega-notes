import { Channel, invoke, invokeCancellable } from "@/shared/lib/desktop";
import type { NoteChangeSet, NoteLibrary, NoteLoadIssue, NoteMediaCatalogItem, NoteSaveResult, NoteSummary, NoteSummaryLibrary, StudyNote } from "../model/note";

type NoteSummaryEvent =
	| { event: "item"; data: NoteSummary }
	| { event: "complete"; data: Omit<NoteSummaryLibrary, "notes"> };
type NoteSummaryCompletion = Omit<NoteSummaryLibrary, "notes">;

const decodeSummary = (value: unknown): NoteSummary => {
	if (!value || typeof value !== "object") throw Error("NOTE_READ_FAILED");
	const note = value as Partial<NoteSummary>;
	if (typeof note.id !== "string" || typeof note.title !== "string" ||
		typeof note.updatedAt !== "number" || !Array.isArray(note.links) ||
		!note.links.every((link) => typeof link === "string") || typeof note.hasContent !== "boolean" || typeof note.hasText !== "boolean" ||
		!Number.isSafeInteger(note.studyContentCharacters) || !Number.isSafeInteger(note.studyContentWords) || !Number.isSafeInteger(note.studyContentLines) ||
		(note.studyContentCharacters ?? -1) < 0 || (note.studyContentWords ?? -1) < 0 || (note.studyContentLines ?? -1) < 0) {
		throw Error("NOTE_READ_FAILED");
	}
	return {
		id: note.id,
		title: note.title,
		updatedAt: note.updatedAt,
		links: note.links as string[],
		hasContent: note.hasContent,
		hasText: note.hasText,
		studyContentCharacters: note.studyContentCharacters!,
		studyContentWords: note.studyContentWords!,
		studyContentLines: note.studyContentLines!,
	};
};

const decodeCompletion = (value: unknown): NoteSummaryCompletion => {
	if (!value || typeof value !== "object") throw Error("NOTE_READ_FAILED");
	const completion = value as NoteSummaryCompletion;
	if (!Array.isArray(completion.issues) || !completion.referenceTitles || typeof completion.referenceTitles !== "object") {
		throw Error("NOTE_READ_FAILED");
	}
	return completion;
};

export const streamNoteSummaries = (
	vaultId: string,
	observerId: string,
	external: boolean,
	resetObserverSnapshot: boolean,
	onItems: (notes: NoteSummary[]) => void,
	signal: AbortSignal,
): Promise<NoteSummaryCompletion> => new Promise((resolve, reject) => {
	const queue: NoteSummaryEvent[] = [];
	const channel = new Channel<NoteSummaryEvent>();
	let done = false, invoked = false, complete: NoteSummaryCompletion | undefined;
	let task: ReturnType<typeof setTimeout> | undefined;
	const requestController = new AbortController();
	const cleanup = () => {
		clearTimeout(timeout); clearTimeout(task); queue.length = 0;
		channel.onmessage = () => undefined;
		channel.close();
		signal.removeEventListener("abort", onAbort);
	};
	const fail = (error: Error = Error("NOTE_READ_FAILED"), cancel = true) => {
		if (done) return;
		done = true;
		cleanup();
		if (cancel) requestController.abort();
		reject(error);
	};
	const onAbort = () => fail(Error("NOTE_READ_CANCELLED"), true);
	const finish = () => {
		if (done || !invoked || !complete || queue.length) return;
		done = true; cleanup(); resolve(complete);
	};
	const drain = () => {
		task = undefined;
		if (done) return;
		try {
			const batch: NoteSummary[] = [];
			for (let count = 0; count < 32 && queue.length; count++) {
				const event = queue.shift()!;
				if (complete) throw Error("NOTE_READ_FAILED");
				if (event.event === "item") batch.push(decodeSummary(event.data));
				else if (event.event === "complete") complete = decodeCompletion(event.data);
				else throw Error("NOTE_READ_FAILED");
			}
			if (batch.length) onItems(batch);
			if (queue.length) task = setTimeout(drain, 0);
			else finish();
		} catch { fail(); }
	};
	const timeout = setTimeout(() => fail(Error("NOTE_READ_FAILED"), true), 120_000);
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) { onAbort(); return; }
	channel.onmessage = (event) => {
		if (done || !event || typeof event !== "object") { fail(); return; }
		queue.push(event);
		if (task === undefined) task = setTimeout(drain, 0);
	};
	void Promise.resolve()
		.then(() => {
			if (done) return;
			return invokeCancellable<void>("stream_note_summaries", { vaultId, observerId, resetObserverSnapshot, external, onItem: channel }, requestController.signal);
		})
		.then(() => { invoked = true; finish(); }, error => fail(error instanceof Error ? error : Error("NOTE_READ_FAILED"), false));
});

export const getNote = (vaultId: string, noteId: string, signal?: AbortSignal): Promise<StudyNote> =>
	signal ? invokeCancellable<StudyNote>("get_note", { vaultId, noteId }, signal) : invoke<StudyNote>("get_note", { vaultId, noteId });

export const listNoteMedia = (): Promise<NoteMediaCatalogItem[]> => invoke("list_note_media");

export const listNotes = (vaultId?: string, external = false): Promise<NoteLibrary> => invoke<NoteLibrary>("list_notes", { vaultId: vaultId ?? null, external });
export const notesChanges = (vaultId: string, observerId: string, signal?: AbortSignal): Promise<NoteChangeSet> =>
	signal ? invokeCancellable<NoteChangeSet>("notes_changes", { vaultId, observerId }, signal) : invoke<NoteChangeSet>("notes_changes", { vaultId, observerId });

export const acknowledgeNoteChanges = (observerId: string, changeToken: string): Promise<void> =>
	invoke<void>("acknowledge_note_changes", { observerId, changeToken });

export const createNote = (title: string): Promise<StudyNote> => invoke<StudyNote>("create_note", { noteTitle: title });

export const renameNote = (noteId: string, title: string): Promise<StudyNote[]> =>
	invoke<StudyNote[]>("rename_note", { noteId, noteTitle: title });

export const saveNote = (note: StudyNote, expected: StudyNote, vaultId: string): Promise<NoteSaveResult> =>
	invoke<NoteSaveResult>("save_note", {
		vaultId, expectedNote: { title: expected.title, document: expected.document },
		noteId: note.id,
		noteTitle: note.title,
		document: note.document,
	});

export const deleteNote = (noteId: string): Promise<NoteLoadIssue[]> =>
	invoke<NoteLoadIssue[]>("delete_note", { noteId });

export const listDeletedNotes = (): Promise<StudyNote[]> => invoke("list_deleted_notes");

export const listDeletedNoteIds = (vaultId: string, signal?: AbortSignal): Promise<string[]> =>
	signal ? invokeCancellable<string[]>("list_deleted_note_ids", { vaultId }, signal) : invoke("list_deleted_note_ids", { vaultId });

export const restoreDeletedNote = (noteId: string): Promise<NoteSaveResult> =>
	invoke("restore_deleted_note", { noteId });
