import { externalLinkUrl } from "./external-links";

type InlineFormat = { bold: boolean; italic: boolean; strike: boolean; highlight: boolean; code: boolean };

const blockTags = new Set([
	"address", "article", "aside", "blockquote", "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure",
	"footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol",
	"p", "pre", "section", "table", "ul",
]);
const ignoredTags = new Set(["head", "meta", "link", "script", "style", "template", "title"]);
const emptyFormat: InlineFormat = { bold: false, italic: false, strike: false, highlight: false, code: false };

const tagOf = (node: Node): string => node.nodeType === 1 ? (node as Element).tagName.toLowerCase() : "";
const childrenOf = (node: ParentNode): Node[] => Array.from(node.childNodes);

const hasVisibleBackground = (color: string): boolean => Boolean(color.trim()) &&
	!/^(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|#(?:fff|ffffff))$/i.test(color.trim());

const formatFor = (element: HTMLElement, inherited: InlineFormat): InlineFormat => {
	const tag = element.tagName.toLowerCase();
	const style = element.style;
	const weight = style.fontWeight.toLowerCase();
	const decoration = `${style.textDecorationLine} ${style.textDecoration}`.toLowerCase();
	return {
		bold: inherited.bold || ["b", "strong"].includes(tag) || weight === "bold" || (Number(weight) >= 600),
		italic: inherited.italic || ["i", "em"].includes(tag) || style.fontStyle.toLowerCase() === "italic",
		strike: inherited.strike || ["s", "del", "strike"].includes(tag) || decoration.includes("line-through"),
		highlight: inherited.highlight || tag === "mark" || hasVisibleBackground(style.backgroundColor),
		code: inherited.code || ["code", "kbd", "samp", "tt"].includes(tag) || /\b(?:monospace|monaco|consolas|courier)\b/i.test(style.fontFamily),
	};
};

const introducedFormat = (format: InlineFormat, inherited: InlineFormat): InlineFormat => ({
	bold: format.bold && !inherited.bold,
	italic: format.italic && !inherited.italic,
	strike: format.strike && !inherited.strike,
	highlight: format.highlight && !inherited.highlight,
	code: format.code && !inherited.code,
});

const wrapInlineText = (text: string, format: InlineFormat): string => text.split("\n").map((line) => {
	if (!line) return line;
	let value = line;
	if (format.code) {
		const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
		const fence = "`".repeat(Math.max(1, longest + 1));
		value = `${fence}${value}${fence}`;
	}
	if (format.highlight) value = `==${value}==`;
	if (format.strike) value = `~~${value}~~`;
	if (format.bold && format.italic) value = `***${value}***`;
	else if (format.bold) value = `**${value}**`;
	else if (format.italic) value = `*${value}*`;
	return value;
}).join("\n");

const renderInline = (node: Node, inherited: InlineFormat = emptyFormat): string => {
	if (node.nodeType === 3) return (node.textContent ?? "").replaceAll("\u00a0", " ");
	if (node.nodeType !== 1) return "";
	const element = node as HTMLElement;
	const tag = tagOf(element);
	if (ignoredTags.has(tag) || ["img", "input", "svg", "video", "audio", "iframe", "object"].includes(tag)) return "";
	if (tag === "br") return "\n";
	const format = formatFor(element, inherited);
	const introduced = introducedFormat(format, inherited);
	if (tag === "a") {
		const label = (element.textContent ?? "").replaceAll("\u00a0", " ");
		const href = externalLinkUrl(element.getAttribute("href")?.trim() ?? "");
		const linked = href && label && !/[\[\]\r\n]/.test(label) ? `[${label}](${href})` : label;
		return wrapInlineText(linked, introduced);
	}
	const children = childrenOf(element).map((child) => renderInline(child, format)).join("");
	return wrapInlineText(children, introduced);
};

const inlineContents = (element: HTMLElement): string => renderInline(element);

const renderFlow = (parent: ParentNode, listDepth: number): string => {
	const parts: string[] = [];
	let inline = "";
	const flushInline = (): void => {
		if (inline.trim()) parts.push(inline.trim());
		inline = "";
	};
	for (const child of childrenOf(parent)) {
		const tag = tagOf(child);
		if (tag && blockTags.has(tag)) {
			flushInline();
			const rendered = renderBlock(child as HTMLElement, listDepth);
			if (rendered) parts.push(rendered);
		} else inline += renderInline(child);
	}
	flushInline();
	return parts.join("\n");
};

const renderList = (list: HTMLElement, depth: number): string => {
	const ordered = list.tagName.toLowerCase() === "ol";
	const startValue = Number.parseInt(list.getAttribute("start") ?? "1", 10);
	let number = Number.isFinite(startValue) ? startValue : 1;
	const indent = "  ".repeat(depth);
	const items = childrenOf(list).filter((child) => tagOf(child) === "li") as HTMLElement[];
	return items.map((item) => {
		const parts: string[] = [];
		let inline = "";
		const flushInline = (): void => {
			if (inline.trim()) parts.push(inline.trim());
			inline = "";
		};
		for (const child of childrenOf(item)) {
			const tag = tagOf(child);
			if (tag === "ul" || tag === "ol") {
				flushInline();
				parts.push(renderList(child as HTMLElement, depth + 1));
			} else if (tag && blockTags.has(tag)) {
				flushInline();
				const rendered = renderBlock(child as HTMLElement, depth + 1);
				if (rendered) parts.push(rendered);
			} else inline += renderInline(child);
		}
		flushInline();
		const marker = ordered ? `${number++}. ` : "- ";
		const first = parts.shift() ?? "";
		const continuation = `${indent}  `;
		const lines = first.split("\n");
		return [
			`${indent}${marker}${lines[0] ?? ""}`,
			...lines.slice(1).map((line) => `${continuation}${line}`),
			...parts,
		].join("\n");
	}).join("\n");
};

const descendantsByTag = (node: ParentNode, tag: string): HTMLElement[] => {
	const results: HTMLElement[] = [];
	for (const child of childrenOf(node)) {
		if (tagOf(child) === tag) results.push(child as HTMLElement);
		if (child.nodeType === 1) results.push(...descendantsByTag(child as ParentNode, tag));
	}
	return results;
};

const renderTable = (table: HTMLElement): string => {
	const rows = descendantsByTag(table, "tr").map((row) => childrenOf(row)
		.filter((cell) => ["th", "td"].includes(tagOf(cell))) as HTMLElement[]);
	if (!rows.length || !rows[0]?.length) return "";
	const cells = (row: HTMLElement[]): string[] => row.map((cell) => inlineContents(cell)
		.replace(/[\r\n]+/g, " ").replaceAll("|", "\\|").trim());
	const headers = cells(rows[0]!);
	const alignments = rows[0]!.map((cell) => {
		const alignment = (cell.style.textAlign || cell.getAttribute("align") || "").toLowerCase();
		return alignment === "center" ? ":---:" : alignment === "right" ? "---:" : ":---";
	});
	return [
		`| ${headers.join(" | ")} |`,
		`| ${alignments.join(" | ")} |`,
		...rows.slice(1).map((row) => `| ${cells(row).join(" | ")} |`),
	].join("\n");
};

const renderBlock = (element: HTMLElement, listDepth: number): string => {
	const tag = element.tagName.toLowerCase();
	if (ignoredTags.has(tag)) return "";
	if (tag === "ul" || tag === "ol") return renderList(element, listDepth);
	if (tag === "hr") return "---";
	if (tag === "table") return renderTable(element);
	if (tag === "pre") {
		const code = element.querySelector("code");
		const content = (code?.textContent ?? element.textContent ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
		const language = code?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ?? "";
		const longest = Math.max(2, ...[...content.matchAll(/^\s*(`{3,})/gm)].map((match) => match[1]!.length));
		const fence = "`".repeat(longest + 1);
		return `${fence}${language ? ` ${language}` : ""}\n${content}\n${fence}`;
	}
	if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inlineContents(element).trim()}`;
	if (tag === "blockquote") {
		const content = renderFlow(element, listDepth);
		return content.split("\n").map((line) => `> ${line}`).join("\n");
	}
	if (tag === "p") return inlineContents(element).trim();
	if (tag === "li") return inlineContents(element).trim();
	return renderFlow(element, listDepth);
};

/** Convert clipboard HTML to the Markdown-like source syntax understood by note text. */
export const convertHtmlClipboardBody = (body: ParentNode): string => renderFlow(body, 0).trim();

export const htmlClipboardToNoteText = (html: string): string | undefined => {
	if (!html.trim() || typeof DOMParser === "undefined") return;
	const body = new DOMParser().parseFromString(html, "text/html").body;
	return convertHtmlClipboardBody(body) || undefined;
};
