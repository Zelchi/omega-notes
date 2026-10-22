import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

type Mode = "edit" | "view";
type SavedSelection = { noteId: string; anchor: number; focus: number };

const offsetInRoot = (root: HTMLElement, node: Node, offset: number): number => {
	const range = document.createRange();
	range.selectNodeContents(root);
	range.setEnd(node, offset);
	return range.toString().length;
};

const positionInRoot = (root: HTMLElement, offset: number): { node: Node; offset: number } => {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let remaining = offset;
	let node: Node | null;
	let last: Node = root;
	while ((node = walker.nextNode())) {
		last = node;
		const length = node.textContent?.length ?? 0;
		if (remaining <= length) return { node, offset: remaining };
		remaining -= length;
	}
	return { node: last, offset: last === root ? 0 : (last.textContent?.length ?? 0) };
};

export const useTemporaryNoteReading = (options: {
	mode: Accessor<Mode>;
	enabled: Accessor<boolean>;
	noteId: Accessor<string | undefined>;
}) => {
	const [reading, setReading] = createSignal(false);
	let savedSelection: SavedSelection | undefined;
	let frame: number | undefined;
	let shortcutUsed = false;
	const mode = (): Mode => options.enabled() && options.mode() === "edit" && reading() ? "view" : options.mode();
	const contentRoot = () => document.querySelector<HTMLElement>("[data-omega-element='text'] [data-omega-content]");

	const changeReading = (value: boolean, restoreFocus = true): void => {
		if (reading() === value) return;
		const root = contentRoot();
		const transitionNoteId = options.noteId();
		const viewport = root?.closest<HTMLElement>("[data-omega-scroll-viewport]");
		const top = viewport?.scrollTop;
		const left = viewport?.scrollLeft;
		if (frame !== undefined) cancelAnimationFrame(frame);
		if (value) {
			const selection = getSelection();
			const noteId = options.noteId();
			savedSelection = root && noteId && document.activeElement === root && selection?.anchorNode && selection.focusNode &&
				root.contains(selection.anchorNode) && root.contains(selection.focusNode)
				? { noteId, anchor: offsetInRoot(root, selection.anchorNode, selection.anchorOffset), focus: offsetInRoot(root, selection.focusNode, selection.focusOffset) }
				: undefined;
			if (root && document.activeElement === root) root.blur();
		}
		setReading(value);
		if (!value) {
			const nextRoot = contentRoot();
			if (restoreFocus && savedSelection && savedSelection.noteId === options.noteId() && nextRoot?.isContentEditable) {
				const anchor = positionInRoot(nextRoot, savedSelection.anchor);
				const focus = positionInRoot(nextRoot, savedSelection.focus);
				nextRoot.focus({ preventScroll: true });
				getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
			}
			savedSelection = undefined;
		}
		const preserveScroll = () => {
			if (options.noteId() === transitionNoteId && viewport?.isConnected && top !== undefined && left !== undefined) {
				viewport.scrollTop = top;
				viewport.scrollLeft = left;
			}
		};
		preserveScroll();
		frame = requestAnimationFrame(() => { frame = undefined; preserveScroll(); });
	};

	createEffect(() => {
		if (!options.enabled() || options.mode() !== "edit") {
			changeReading(false, false);
			savedSelection = undefined;
		}
	});

	onMount(() => {
		const isAlt = (event: KeyboardEvent) => event.key === "Alt" || event.code === "AltLeft" || event.code === "AltRight";
		const release = (restoreFocus = true) => { shortcutUsed = false; changeReading(false, restoreFocus); };
		const keyDown = (event: KeyboardEvent) => {
			if (isAlt(event)) {
				if (event.repeat || event.ctrlKey || event.metaKey || event.getModifierState("AltGraph") || shortcutUsed || !options.enabled() || options.mode() !== "edit") return;
				const target = event.target;
				if (target instanceof HTMLElement && (target.closest("input, textarea, [role='dialog']") ||
					(target.isContentEditable && !target.closest("[data-omega-element='text']")))) return;
				event.preventDefault();
				changeReading(true);
			} else if (event.altKey && !["Shift", "Meta"].includes(event.key)) {
				shortcutUsed = true;
				changeReading(false);
			}
		};
		const keyUp = (event: KeyboardEvent) => {
			if (isAlt(event) || !event.altKey) {
				if (isAlt(event) && (reading() || shortcutUsed)) event.preventDefault();
				release();
			}
		};
		const blur = () => release(false);
		const visibility = () => { if (document.hidden) release(false); };
		window.addEventListener("keydown", keyDown, true);
		window.addEventListener("keyup", keyUp, true);
		window.addEventListener("blur", blur);
		document.addEventListener("visibilitychange", visibility);
		onCleanup(() => {
			window.removeEventListener("keydown", keyDown, true);
			window.removeEventListener("keyup", keyUp, true);
			window.removeEventListener("blur", blur);
			document.removeEventListener("visibilitychange", visibility);
		});
	});
	onCleanup(() => { if (frame !== undefined) cancelAnimationFrame(frame); });
	return { mode };
};
