import { EMPTY_CHARACTER } from "../../lib/editable-text-dom";

export type CaretPosition = { node: Node; offset: number };

type CaretDocument = Document & {
	caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export const stripEmptyCharacter = (text: string): string => text.replaceAll(EMPTY_CHARACTER, "");
export const getVisibleLength = (text: string): number => stripEmptyCharacter(text).length;

export const getNativeCaretPosition = (root: HTMLElement, clientX: number, clientY: number): CaretPosition | undefined => {
	const caretDocument = document as CaretDocument;
	const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
	if (position && root.contains(position.offsetNode)) {
		return { node: position.offsetNode, offset: position.offset };
	}

	const range = caretDocument.caretRangeFromPoint?.(clientX, clientY);
	if (range && root.contains(range.startContainer)) {
		return { node: range.startContainer, offset: range.startOffset };
	}
};

export const getOffsetBeforeNode = (root: HTMLElement, node: Node, offset: number): number => {
	const parent = node instanceof Element ? node : node.parentElement;
	const fragment = parent?.closest<HTMLElement>("[data-text-fragment]");
	if (fragment && root.contains(fragment)) {
		const start = Number(fragment.dataset.start);
		if (Number.isFinite(start)) {
			if (node === fragment.firstChild && node instanceof Text) {
				const value = node.textContent ?? "";
				return start + getVisibleLength(value.slice(0, offset));
			}
			const range = document.createRange();
			range.selectNodeContents(fragment);
			range.setEnd(node, offset);
			return start + getVisibleLength(range.toString());
		}
	}

	const range = document.createRange();
	range.selectNodeContents(root);
	range.setEnd(node, offset);
	return getVisibleLength(range.toString());
};

export const findTextPosition = (root: HTMLElement, requestedOffset: number): { node: Text; offset: number } | undefined => {
	let lastPosition: { node: Text; offset: number } | undefined;
	for (const fragment of root.querySelectorAll<HTMLElement>("[data-text-fragment]")) {
		if (fragment.hasAttribute("data-editable-table-source")) continue;
		const start = Number(fragment.dataset.start);
		const node = fragment.firstChild;
		if (!Number.isFinite(start) || !(node instanceof Text)) continue;

		const value = node.textContent ?? "";
		const visibleLength = getVisibleLength(value);
		if (visibleLength === 0 && requestedOffset === start) return { node, offset: 0 };
		if (requestedOffset >= start && requestedOffset < start + visibleLength) {
			if (!value.includes(EMPTY_CHARACTER)) {
				return { node, offset: requestedOffset - start };
			}
			let offset = 0;
			let consumed = 0;
			while (offset < value.length && consumed < requestedOffset - start) {
				if (value[offset] !== EMPTY_CHARACTER) consumed += 1;
				offset += 1;
			}
			return { node, offset };
		}
		lastPosition = {
			node,
			offset: value.endsWith(EMPTY_CHARACTER) ? Math.max(0, value.length - 1) : value.length,
		};
	}
	return lastPosition;
};

export const ensureEmptyTextPosition = (root: HTMLElement): CaretPosition | undefined => {
	const fragment = root.querySelector<HTMLElement>("[data-text-fragment]");
	if (!fragment) return undefined;

	let node = fragment.firstChild;
	if (!(node instanceof Text)) {
		node = document.createTextNode(EMPTY_CHARACTER);
		fragment.replaceChildren(node);
	} else if (!node.textContent) {
		node.textContent = EMPTY_CHARACTER;
	}

	return { node, offset: 0 };
};
