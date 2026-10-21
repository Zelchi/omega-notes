import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import { displayNoteTitle, normalizeNoteTitle, type NoteSummary } from "@/entities/note";
import { noteLinkAtCaret, type NoteLinkContext } from "./link-context";

export const useNoteLinkSuggestions = (options: {
	notes: Accessor<NoteSummary[]>;
	text: Accessor<string>;
	caretOffset: Accessor<number | undefined>;
	onSelect: (note: NoteSummary, context: NoteLinkContext) => void;
}) => {
	const context = createMemo(() => noteLinkAtCaret(options.text(), options.caretOffset()));
	const [dismissed, setDismissed] = createSignal<string>();
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	let titleCache = new Map<string, { raw: string; title: string }>();
	const titles = createMemo(() => {
		if (!context()) return [];
		const nextCache = new Map<string, { raw: string; title: string }>();
		const records = options.notes().map((note) => {
			const cached = titleCache.get(note.id);
			const label = displayNoteTitle(note);
			const entry = cached?.raw === label ? cached : { raw: label, title: normalizeNoteTitle(label) };
			nextCache.set(note.id, entry);
			return { note, title: entry.title };
		});
		titleCache = nextCache;
		return records;
	});
	const suggestions = createMemo(() => {
		const current = context();
		if (!current) return [];
		const query = normalizeNoteTitle(current.query);
		return titles().filter(({ title }) => title.includes(query))
			.sort((left, right) => Number(right.title.startsWith(query)) - Number(left.title.startsWith(query)) ||
				left.title.localeCompare(right.title, "pt-BR", { numeric: true }))
			.slice(0, 6).map(({ note }) => note);
	});
	const open = () => Boolean(context() && context()!.key !== dismissed());
	createEffect(() => {
		context()?.key;
		suggestions();
		setSelectedIndex(0);
		if (!context()) setDismissed(undefined);
	});
	const select = (note: NoteSummary) => {
		const current = context();
		if (!current) return;
		setDismissed(current.key);
		options.onSelect(note, current);
	};
	const handleKeyDown = (event: KeyboardEvent): boolean => {
		if (!open() || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
			(event.key === "Tab" && event.shiftKey)) return false;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			setDismissed(context()!.key);
			return true;
		}
		const notes = suggestions();
		if (!notes.length) return false;
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			event.stopPropagation();
			setSelectedIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + notes.length) % notes.length);
			return true;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault();
			event.stopPropagation();
			select(notes[selectedIndex()]!);
			return true;
		}
		return false;
	};
	return { open, suggestions, selectedIndex, select, handleKeyDown };
};
