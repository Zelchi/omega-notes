import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { StudyNote } from "@/entities/note";

export const useNoteDeletion = (options: {
	vaultId: Accessor<string | undefined>;
	notes: Accessor<StudyNote[]>;
	blocked: Accessor<boolean>;
	beforeDelete: () => Promise<boolean>;
	remove: (note: StudyNote) => Promise<void>;
	onDeleted: (id: string) => void;
}) => {
	const [target, setTarget] = createSignal<{ id: string; vaultId: string }>();
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal(false);
	let disposed = false;
	onCleanup(() => { disposed = true; });
	const note = createMemo(() => {
		const current = target();
		return current?.vaultId === options.vaultId() ? options.notes().find(note => note.id === current?.id) : undefined;
	});
	createEffect(() => {
		if (target() && !note()) { setTarget(undefined); setError(false); }
	});
	const close = () => { if (!pending()) { setTarget(undefined); setError(false); } };
	const hasContent = (note: StudyNote) => note.document.elements.some(element => element.type !== "text" || element.text.trim().length > 0);
	const execute = async (id: string, vaultId: string, confirmed = false): Promise<void> => {
		if (disposed || pending() || options.blocked() || vaultId !== options.vaultId()) return;
		setPending(true); setError(false);
		try {
			if (!(await options.beforeDelete())) throw new Error("SAVE_FAILED");
			if (disposed || vaultId !== options.vaultId()) return;
			const current = options.notes().find(note => note.id === id);
			if (!current || options.blocked()) return;
			// Saving can yield to editing or an AI update. Recheck the latest document before deleting.
			if (!confirmed && hasContent(current)) { setTarget({ id, vaultId }); return; }
			await options.remove(current);
			if (disposed || vaultId !== options.vaultId()) return;
			if (options.notes().some(note => note.id === id)) throw new Error("DELETE_FAILED");
			setTarget(undefined);
			options.onDeleted(id);
		} catch (cause) {
			console.error("Could not delete note", cause);
			if (!disposed && vaultId === options.vaultId()) setError(true);
		} finally { if (!disposed) setPending(false); }
	};
	return {
		target: note, pending, error, close,
		request: async (requested: StudyNote): Promise<void> => {
			if (disposed || pending() || target() || options.blocked()) return;
			const vaultId = options.vaultId(), current = options.notes().find(note => note.id === requested.id);
			if (!vaultId || !current) return;
			setError(false);
			if (hasContent(current)) setTarget({ id: current.id, vaultId });
			else await execute(current.id, vaultId);
		},
		confirm: async () => {
			const current = target();
			if (current) await execute(current.id, current.vaultId, true);
		},
	};
};
