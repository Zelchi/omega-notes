import { createEffect, createSignal, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import type { NotesLibrary, StudyNote } from "@/entities/note";
import { playSound } from "@/shared/ui/sound";

export type CanvasSnapshot = {
	layout: "static" | "dynamic";
	positions: Record<string, { x: number; y: number }>;
};
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
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal(false);
	const [restoration, setRestoration] = createSignal<CanvasRestore>();
	let reader: (() => CanvasSnapshot) | undefined;
	let revision = 0;
	let errorTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	const reportError = (cause: unknown) => {
		console.error(cause);
		setError(true);
		clearTimeout(errorTimer);
		errorTimer = setTimeout(() => setError(false), 3000);
	};
	const capture = (): CanvasSnapshot | undefined => reader?.();
	const history = (): History | undefined => {
		const id = options.vaultId();
		return id ? histories.get(id) : undefined;
	};
	const record = (action: Action): void => {
		const current = history();
		if (!current || pending()) return;
		current.past.push(action);
		if (current.past.length > 100) current.past.shift();
		current.future = [];
		setRestoration(undefined);
	};
	const restorePositions = (snapshot?: CanvasSnapshot): void => {
		const vaultId = options.vaultId();
		if (!snapshot || !vaultId) return;
		options.setLayout(snapshot.layout);
		setRestoration({ ...snapshot, vaultId, revision: ++revision });
	};
	createEffect(() => {
		const id = options.vaultId();
		if (!id || options.notes.loading() || histories.has(id)) return;
		const current: History = { past: [], future: [] };
		histories.set(id, current);
		setPending(true);
		const activeIds = new Set(untrack(options.notes.notes).map((note) => note.id));
		void options.notes.listDeleted().then((deleted) => {
			if (disposed || histories.get(id) !== current) return;
			const recovered: Action[] = deleted.filter((note) => !activeIds.has(note.id))
				.reverse().map((note) => ({ kind: "delete", noteId: note.id }));
			const known = new Set(current.past.flatMap((action) => action.kind === "move" ? [] : [action.noteId]));
			current.past = [...recovered.filter((action) => action.kind !== "move" && !known.has(action.noteId)), ...current.past].slice(-100);
		}).catch(reportError).finally(() => setPending(false));
	});

	const remove = async (note: StudyNote): Promise<void> => {
		if (pending()) return;
		const before = capture();
		const id = options.vaultId();
		setPending(true);
		try {
			if (!(await options.notes.remove(note))) throw new Error("SAVE_FAILED");
			if (!disposed && id === options.vaultId()) playSound("note-delete");
			setPending(false);
			if (id === options.vaultId()) record({ kind: "delete", noteId: note.id, before, after: capture() });
		} catch (cause) { reportError(cause); }
		finally { setPending(false); }
	};
	const travel = async (redo: boolean): Promise<void> => {
		const current = history();
		if (!current || pending()) return;
		const source = redo ? current.future : current.past;
		const destination = redo ? current.past : current.future;
		const action = source.at(-1);
		if (!action) return;
		setPending(true);
		try {
			if (action.kind !== "move") {
				const shouldExist = action.kind === "create" ? redo : !redo;
				const note = options.notes.notes().find((item) => item.id === action.noteId);
				if (shouldExist && !note) {
					await options.notes.restore(action.noteId);
					if (!disposed && current === history()) playSound("note-create");
				} else if (!shouldExist && note) {
					if (!(await options.notes.remove(note))) throw new Error("SAVE_FAILED");
					if (!disposed && current === history()) playSound("note-delete");
				}
			}
			restorePositions(redo ? action.after : action.before);
			source.pop();
			destination.push(action);
			setError(false);
		} catch (cause) { reportError(cause); }
		finally { setPending(false); }
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
	onCleanup(() => { disposed = true; clearTimeout(errorTimer); });
	return {
		pending, error, restoration,
		remove,
		register: (read?: () => CanvasSnapshot) => { reader = read; },
		restored: () => setRestoration(undefined),
		created: (note: StudyNote, before: CanvasSnapshot, after: CanvasSnapshot) => record({ kind: "create", noteId: note.id, before, after }),
		moved: (before: CanvasSnapshot, after: CanvasSnapshot) => {
			if (JSON.stringify(before.positions) !== JSON.stringify(after.positions)) record({ kind: "move", before, after });
		},
	};
};
