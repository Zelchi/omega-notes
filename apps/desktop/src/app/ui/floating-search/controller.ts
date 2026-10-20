import { isTerminalTarget } from "@/shared/lib/terminal-focus";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { createSearchIndex, searchNotes, type SearchIndex } from "../../lib/search";

export type FloatingSearchProps = {
	notes: StudyNote[];
	mode: "edit" | "view";
	showBackButton: boolean;
	backButtonDisabled: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	isOnCanvas: boolean;
	t: (key: TranslationKey) => string;
	onBack: () => void;
	onHistoryBack: () => void;
	onHistoryForward: () => void;
	onModeChange: (mode: "edit" | "view") => void;
	onSelectNote: (note: StudyNote) => void;
};

export const useFloatingSearchController = (props: FloatingSearchProps) => {
	const [query, setQuery] = createSignal("");
	const [activeIndex, setActiveIndex] = createSignal(0);
	let root!: HTMLDivElement;
	let indexedNotes: StudyNote[] | undefined;
	let searchIndex: SearchIndex | undefined;
	const results = createMemo(() => {
		const value = query();
		if (!value.trim()) return [];
		const notes = props.notes;
		const locale = props.t("locale");
		if (!searchIndex || notes !== indexedNotes || searchIndex.locale !== locale) {
			searchIndex = createSearchIndex(notes, locale, searchIndex);
			indexedNotes = notes;
		}
		return searchNotes(searchIndex, value).slice(0, 6);
	});

	createEffect(() => {
		results();
		setActiveIndex(0);
	});

	const onOutsidePointer = (event: PointerEvent) => {
		if (event.target instanceof Node && root.contains(event.target)) return;

		const input = root.querySelector("input");
		if (document.activeElement === input) input?.blur();
		setQuery("");
	};
	const onSearchShortcut = (event: KeyboardEvent): void => {
		if (isTerminalTarget(event.target) || event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "p") return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.repeat || !root.isConnected || root.closest("[inert]") || document.querySelector("[aria-modal='true']:not([inert])")) return;
		const input = root.querySelector("input");
		input?.focus({ preventScroll: true });
		input?.select();
	};
	onMount(() => {
		addEventListener("pointerdown", onOutsidePointer);
		addEventListener("keydown", onSearchShortcut, true);
	});
	onCleanup(() => {
		removeEventListener("pointerdown", onOutsidePointer);
		removeEventListener("keydown", onSearchShortcut, true);
	});

	const select = (note: StudyNote): void => {
		setQuery("");
		props.onSelectNote(note);
	};

	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.isComposing) return;
		if (event.key === "Escape" && query()) {
			event.preventDefault();
			event.stopPropagation();
			setQuery("");
			return;
		}
		const notes = results();
		if (!notes.length) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			const direction = event.key === "ArrowDown" ? 1 : -1;
			setActiveIndex((index) => (index + direction + notes.length) % notes.length);
		}
		if (event.key === "Enter" && notes[activeIndex()]) {
			event.preventDefault();
			event.stopPropagation();
			select(notes[activeIndex()]!);
		}
	};

	return {
		query,
		activeIndex,
		setActiveIndex,
		results,
		select,
		setQuery,
		handleKeyDown,
		setRoot: (element: HTMLDivElement) => (root = element),
	};
};
