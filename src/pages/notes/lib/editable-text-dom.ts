import type { TextFlowFragment } from "./text-flow-layout";

export const EMPTY_CHARACTER = "\u200B";

type EditableTextLayout = {
	text: string;
	x: number;
	y: number;
	width: number;
	alignment: string;
	fragments?: TextFlowFragment[];
	naturalClass: string;
	fragmentClass: string;
};

export const syncEditableTextDom = (root: HTMLElement, layout: EditableTextLayout): HTMLSpanElement | undefined => {
	const fragments = layout.fragments ?? [
		{ start: 0, end: layout.text.length, text: layout.text, left: 0, top: 0, width: layout.width },
	];
	const existing = [...root.children].filter(
		(node): node is HTMLSpanElement => node instanceof HTMLSpanElement && node.hasAttribute("data-text-fragment"),
	);
	const nodes = fragments.map((fragment, index) => {
		const node = existing[index] ?? document.createElement("span");
		node.className = layout.fragments ? layout.fragmentClass : layout.naturalClass;
		node.dataset.textFragment = "";
		node.dataset.start = String(fragment.start);
		node.dataset.end = String(fragment.end);
		node.style.left = `${layout.x + fragment.left}px`;
		node.style.top = `${layout.y + fragment.top}px`;
		node.style.width = `${fragment.width}px`;
		node.style.textAlignLast = layout.alignment === "justify" ? "justify" : "auto";
		const text = !layout.fragments && fragment.text.endsWith("\n")
			? `${fragment.text}${EMPTY_CHARACTER}`
			: fragment.text || EMPTY_CHARACTER;
		if (node.childNodes.length !== 1 || !(node.firstChild instanceof Text) || node.textContent !== text) {
			node.textContent = text;
		}
		return node;
	});
	const current = [...root.childNodes];
	if (current.length !== nodes.length || current.some((node, index) => node !== nodes[index])) {
		root.replaceChildren(...nodes);
	}
	return layout.fragments ? undefined : nodes[0];
};
