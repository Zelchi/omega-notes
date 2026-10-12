export type TextFormat = "bold" | "italic" | "separator" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type TextSelection = { start: number; end: number };
export type TextFormatHandler = (format: TextFormat) => void;

export const formatSelection = (text: string, selection: TextSelection, format: TextFormat): { text: string; selection: TextSelection } => {
	const start = Math.max(0, Math.min(selection.start, text.length));
	const end = Math.max(start, Math.min(selection.end, text.length));
	if (format === "bold" || format === "italic") {
		const marker = format === "bold" ? "**" : "*";
		const selected = text.slice(start, end);
		if (selected.includes("\n")) {
			const replacement = selected.split("\n").map((line) => line ? formatSelection(line, { start: 0, end: line.length }, format).text : line).join("\n");
			return { text: text.slice(0, start) + replacement + text.slice(end), selection: { start, end: start + replacement.length } };
		}
		const beforeStars = text.slice(0, start).match(/\*+$/)?.[0].length ?? 0;
		const afterStars = text.slice(end).match(/^\*+/)?.[0].length ?? 0;
		const surrounding = Math.min(beforeStars, afterStars);
		const removeMarkers = format === "bold" ? surrounding >= 2 : surrounding === 1 || surrounding === 3;
		if (removeMarkers) {
			return {
				text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
				selection: { start: start - marker.length, end: end - marker.length },
			};
		}
		if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2 &&
			(format === "bold" || !selected.startsWith("**"))) {
			const content = selected.slice(marker.length, -marker.length);
			return { text: text.slice(0, start) + content + text.slice(end), selection: { start, end: start + content.length } };
		}
		return {
			text: text.slice(0, start) + marker + selected + marker + text.slice(end),
			selection: { start: start + marker.length, end: end + marker.length },
		};
	}
	if (format === "separator") {
		const before = text.slice(0, start);
		const after = text.slice(end);
		const insertion = `${before && !before.endsWith("\n") ? "\n" : ""}---\n`;
		const caret = before.length + insertion.length;
		return { text: before + insertion + after, selection: { start: caret, end: caret } };
	}
	const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
	const lastSelected = end > start && text[end - 1] === "\n" ? end - 1 : end;
	const newline = text.indexOf("\n", lastSelected);
	const lineEnd = newline < 0 ? text.length : newline;
	const prefix = `${"#".repeat(Number(format.slice(1)))} `;
	const lines = text.slice(lineStart, lineEnd).split("\n");
	const remove = lines.every((line) => line.startsWith(prefix));
	const replacement = lines.map((line) => {
		const content = line.replace(/^#{1,6}[ \t]+/, "");
		return remove ? content : prefix + content;
	}).join("\n");
	const mapOffset = (offset: number): number => {
		let oldCursor = lineStart;
		let newCursor = lineStart;
		for (const line of lines) {
			const oldPrefix = line.match(/^#{1,6}[ \t]+/)?.[0].length ?? 0;
			const newPrefix = remove ? 0 : prefix.length;
			if (offset <= oldCursor + line.length) return newCursor + newPrefix + Math.max(0, offset - oldCursor - oldPrefix);
			oldCursor += line.length + 1;
			newCursor += line.length - oldPrefix + newPrefix + 1;
		}
		return lineStart + replacement.length;
	};
	return {
		text: text.slice(0, lineStart) + replacement + text.slice(lineEnd),
		selection: { start: mapOffset(start), end: mapOffset(end) },
	};
};
