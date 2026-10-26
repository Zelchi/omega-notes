import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import type { NotesLibrary, NoteSummary, StudyNote } from "@/entities/note";
import { playSound } from "@/shared/ui/sound";
import { CanvasSnapshotStore, type CanvasSnapshot } from "./canvas-snapshot-store";

export type { CanvasSnapshot } from "./canvas-snapshot-store";
export type CanvasRestore = CanvasSnapshot & { vaultId: string; revision: number };
type Action = { kind: "create" | "delete"; noteId: string; before?: CanvasSnapshot; after?: CanvasSnapshot }
	| { kind: "move"; before: CanvasSnapshot; after: CanvasSnapshot };
type History = { past: Action[]; future: Action[] };

export const useCanvasHistory = (options: {
	vaultId: Accessor<string | undefined>;
	notes: NotesLibrary;
	enabled: Accessor<boolean>;
	setLayout: (layout: CanvasSnapshot["layout"]) => void;
}) => {
	const histories = new Map<string, History>();
	const snapshots = new CanvasSnapshotStore();
	const [loadingVaults, setLoadingVaults] = createSignal<ReadonlyMap<string, History>>(new Map());
	const [mutating, setMutating] = createSignal(false);
	const pending = createMemo(() => mutating() || options.notes.loading() || loadingVaults().has(options.vaultId() ?? ""));
	const [error, setError] = createSignal(false);
	const [restoration, setRestoration] = createSignal<CanvasRestore>();
	let revision = 0;
	let errorTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	const reportError = (cause: unknown, vaultId: string) => {
		if (disposed || vaultId !== options.vaultId()) return;
		console.error(cause);
		setError(true);
		clearTimeout(errorTimer);
		errorTimer = setTimeout(() => setError(false), 3000);
	};
	const history = (): History | undefined => {
		const id = options.vaultId();
		return id ? histories.get(id) : undefined;
	};
	const record = (current: History, action: Action): void => {
		current.past.push(action);
		if (current.past.length > 100) current.past.shift();
		current.future = [];
	};
	const rememberAction = (vaultId: string, action: Action): void => {
		const current = histories.get(vaultId);
		if (disposed || !current || mutating() || loadingVaults().has(vaultId)) return;
		record(current, action);
		if (action.after) snapshots.remember(vaultId, action.after);
		if (vaultId === options.vaultId()) setRestoration(undefined);
	};
	const restorePositions = (vaultId: string, snapshot?: CanvasSnapshot): void => {
		if (!snapshot) return;
		snapshots.remember(vaultId, snapshot);
		options.setLayout(snapshot.layout);
		setRestoration({ ...snapshot, vaultId, revision: ++revision });
	};
	createEffect(() => {
		options.vaultId();
		clearTimeout(errorTimer);
		setError(false);
		setRestoration(undefined);
	});
	createEffect(() => {
		const id = options.vaultId();
		if (!id || options.notes.loading() || histories.has(id)) return;
		const current: History = { past: [], future: [] };
		histories.set(id, current);
		setLoadingVaults(previous => new Map(previous).set(id, current));
		const activeIds = new Set(untrack(options.notes.notes).map((note) => note.id));
		void options.notes.listDeleted().then((deleted) => {
			if (disposed || histories.get(id) !== current) return;
			const recovered: Action[] = deleted.filter((noteId) => !activeIds.has(noteId))
				.reverse().map((noteId) => ({ kind: "delete", noteId }));
			const known = new Set(current.past.flatMap((action) => action.kind === "move" ? [] : [action.noteId]));
			current.past = [...recovered.filter((action) => action.kind !== "move" && !known.has(action.noteId)), ...current.past].slice(-100);
		}).catch(cause => {
			if (disposed) return;
			if (histories.get(id) === current) histories.delete(id);
			reportError(cause, id);
		}).finally(() => {
			if (disposed) return;
			setLoadingVaults(previous => {
				if (previous.get(id) !== current) return previous;
				const next = new Map(previous); next.delete(id); return next;
			});
		});
	});

	const remove = async (note: NoteSummary): Promise<void> => {
		const id = options.vaultId(), current = history();
		if (disposed || !id || !current || pending()) return;
		const before = snapshots.read(id);
		setMutating(true);
		try {
			if (!(await options.notes.remove(note))) throw new Error("SAVE_FAILED");
			if (disposed) return;
			const after = snapshots.read(id);
			if (after) { delete after.positions[note.id]; snapshots.remember(id, after); }
			record(current, { kind: "delete", noteId: note.id, before, after });
			if (id === options.vaultId()) { playSound("note-delete"); setRestoration(undefined); }
		} catch (cause) { reportError(cause, id); }
		finally { if (!disposed) setMutating(false); }
	};
	const travel = async (redo: boolean): Promise<void> => {
		const current = history(), id = options.vaultId();
		if (disposed || !current || !id || pending()) return;
		const source = redo ? current.future : current.past;
		const destination = redo ? current.past : current.future;
		const action = source.at(-1);
		if (!action) return;
		setMutating(true);
		try {
			if (action.kind !== "move") {
				const shouldExist = action.kind === "create" ? redo : !redo;
				const note = options.notes.notes().find((item) => item.id === action.noteId);
				if (shouldExist && !note) {
					await options.notes.restore(action.noteId);
					if (!disposed && id === options.vaultId()) playSound("note-create");
				} else if (!shouldExist && note) {
					if (!(await options.notes.remove(note))) throw new Error("SAVE_FAILED");
					if (!disposed && id === options.vaultId()) playSound("note-delete");
				}
			}
			if (disposed || id !== options.vaultId() || current !== history()) return;
			restorePositions(id, redo ? action.after : action.before);
			source.pop();
			destination.push(action);
			setError(false);
		} catch (cause) { reportError(cause, id); }
		finally { if (!disposed) setMutating(false); }
	};
	onMount(() => {
		const shortcut = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented || !options.enabled()) return;
			if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"], [role="dialog"], [data-ai-chat-panel]')) return;
			const key = event.key.toLowerCase();
			if (key !== "z" && key !== "y") return;
			event.preventDefault();
			if (!event.repeat) void travel(key === "y" || event.shiftKey);
		};
		window.addEventListener("keydown", shortcut);
		onCleanup(() => window.removeEventListener("keydown", shortcut));
	});
	onCleanup(() => { disposed = true; clearTimeout(errorTimer); snapshots.clear(); });
	return {
		pending, error, restoration, remove,
		register: (vaultId: string, reader: () => CanvasSnapshot) => snapshots.register(vaultId, reader),
		restored: () => setRestoration(undefined),
		created: (vaultId: string, note: StudyNote, before: CanvasSnapshot, after: CanvasSnapshot) => rememberAction(vaultId, { kind: "create", noteId: note.id, before, after }),
		moved: (vaultId: string, before: CanvasSnapshot, after: CanvasSnapshot) => {
			if (JSON.stringify(before) !== JSON.stringify(after)) rememberAction(vaultId, { kind: "move", before, after });
		},
	};
};
