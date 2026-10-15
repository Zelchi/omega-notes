import type { InlineTextFormat } from "@/shared/lib/formatted-text";

export type TextFormat = InlineTextFormat | "bullet-list" | "ordered-list" | "quote" | "code-block" | "task" | "separator" | "table" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type TextSelection = { start: number; end: number };
export type TextFormatHandler = (format: TextFormat) => void;

export const formatSelection = (text: string, selection: TextSelection, format: TextFormat, options: { tableColumnLabel?: string } = {}): { text: string; selection: TextSelection } => {
	const start = Math.max(0, Math.min(selection.start, text.length));
	const end = Math.max(start, Math.min(selection.end, text.length));
    if (format === "note-link") {
        const selected = text.slice(start, end);
        const references = [...text.matchAll(/\[\[([^\[\]\r\n]*)\]\]/g)];
        const enclosing = references.find((match) => {
            const from = match.index!;
            const to = from + match[0].length;
            return start === end ? start > from && start < to : start >= from && end <= to;
        });
        const visibleText = (body: string): string => {
            const separator = body.indexOf("|");
            return separator < 0 ? body : body.slice(separator + 1);
        };
        if (enclosing) {
            const from = enclosing.index!;
            const body = enclosing[1]!;
            const content = visibleText(body);
            const labelStart = from + 2 + (body.includes("|") ? body.indexOf("|") + 1 : 0);
            const caret = from + Math.max(0, Math.min(content.length, start - labelStart));
            return {
                text: text.slice(0, from) + content + text.slice(from + enclosing[0].length),
                selection: start === end ? { start: caret, end: caret } : { start: from, end: from + content.length },
            };
        }
        const contained = references.filter((match) => match.index! >= start && match.index! + match[0].length <= end);
        if (contained.length) {
            const content = selected.replace(/\[\[([^\[\]\r\n]*)\]\]/g, (_reference, body: string) => visibleText(body));
            return { text: text.slice(0, start) + content + text.slice(end), selection: { start, end: start + content.length } };
        }
        // A selection crossing a reference boundary must not create nested links.
        if (references.some((match) => start < match.index! + match[0].length && end > match.index!)) return { text, selection: { start, end } };
        const caret = start + 2 + selected.length;
        return {
            text: text.slice(0, start) + `[[${selected}]]` + text.slice(end),
            selection: { start: caret, end: caret },
        };
    }
    if (format === "quote" || format === "ordered-list" || format === "bullet-list" || format === "task") {
        const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
        const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
        const newline = text.indexOf("\n", last);
        const lineEnd = newline < 0 ? text.length : newline;
        const lines = text.slice(lineStart, lineEnd).split("\n");
        const pattern = format === "quote" ? /^>[ \t]?/ : format === "task" ? /^-[ \t]+\[[ xX]?\](?:[ \t]+|$)/ :
            format === "bullet-list" ? /^-(?![ \t]+\[[ xX]?\](?:[ \t]|$))(?:[ \t]+|$)/ : /^\d+\.[ \t]+/;
        const previous = text.slice(0, Math.max(0, lineStart - 1)).split("\n").at(-1)?.match(/^[ \t]*(\d+)\.[ \t]+/);
        const firstNumber = previous && lineStart > 0 ? Number(previous[1]) + 1 : 1;
        const remove = lines.every((line) => pattern.test(line.trimStart()));
        const changes = lines.map((line, index) => {
            const indent = line.match(/^[ \t]*/)?.[0] ?? "";
            const content = line.slice(indent.length);
            const oldPrefix = content.match(format === "quote" ? pattern :
                /^(?:\d+\.[ \t]+|-[ \t]+\[[ xX]?\](?:[ \t]+|$)|-(?:[ \t]+|$))/)?.[0] ?? "";
            const prefix = remove ? "" : format === "quote" ? "> " : format === "task" ? "- [ ] " : format === "bullet-list" ? "- " : `${firstNumber + index}. `;
            return { original: line, text: indent + prefix + content.slice(oldPrefix.length), indent: indent.length, oldLength: oldPrefix.length, newLength: prefix.length };
        });
        const replacement = changes.map((line) => line.text).join("\n");
        const map = (offset: number) => {
            let oldCursor = lineStart;
            let newCursor = lineStart;
            for (const line of changes) {
                if (offset <= oldCursor + line.original.length) return newCursor + line.indent + line.newLength + Math.max(0, offset - oldCursor - line.indent - line.oldLength);
                oldCursor += line.original.length + 1;
                newCursor += line.text.length + 1;
            }
            return lineStart + replacement.length;
        };
        return { text: text.slice(0, lineStart) + replacement + text.slice(lineEnd), selection: { start: map(start), end: map(end) } };
    }
    if (format === "code-block" || (format === "code" && text.slice(start, end).includes("\n"))) {
        const selected = text.slice(start, end);
        const before = text.slice(0, start);
        const after = text.slice(end);
        const opening = before.match(/(?:^|\n)(`{3,})\n$/);
        if (opening && after.match(/^\n(`{3,})(?=\n|$)/)?.[1] === opening[1]) {
            const prefixLength = opening[1]!.length + 1;
            const newStart = start - prefixLength;
            return { text: before.slice(0, -prefixLength) + selected + after.slice(prefixLength), selection: { start: newStart, end: newStart + selected.length } };
        }
        const wrapped = selected.match(/^(`{3,})[^`\n]*\n([\s\S]*)\n\1$/);
        if (wrapped) return { text: before + wrapped[2] + after, selection: { start, end: start + wrapped[2]!.length } };
        const longest = (selected.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
        const fence = "`".repeat(Math.max(3, longest + 1));
        const prefix = `${before && !before.endsWith("\n") ? "\n" : ""}${fence}\n`;
        const suffix = `\n${fence}${after.startsWith("\n") ? "" : "\n"}`;
        const caret = start + prefix.length;
        return { text: before + prefix + selected + suffix + after, selection: { start: caret, end: caret + selected.length } };
    }
	if (format === "table") {
		const before = text.slice(0, start);
		const prefix = before && !before.endsWith("\n") ? "\n" : "";
		const label = options.tableColumnLabel ?? "Column";
		const headers = [1, 2, 3].map((column) => `${label} ${column}`);
		const table = `| ${headers.join(" | ")} |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\n`;
		const caret = before.length + prefix.length + 2;
		return { text: before + prefix + table + text.slice(end), selection: { start: caret, end: caret + headers[0]!.length } };
	}
	if (format === "bold" || format === "italic" || format === "strike" || format === "highlight" || format === "code") {
		const selected = text.slice(start, end);
		if (format === "code") {
			const wrapped = selected.match(/^(`+)([\s\S]+?)\1$/);
			if (wrapped) return { text: text.slice(0, start) + wrapped[2] + text.slice(end), selection: { start, end: start + wrapped[2]!.length } };
		}
		const beforeTicks = text.slice(0, start).match(/`+$/)?.[0] ?? "";
		const afterTicks = text.slice(end).match(/^`+/)?.[0] ?? "";
		const longest = (selected.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
		const codeMarker = beforeTicks && beforeTicks === afterTicks ? beforeTicks : "`".repeat(longest + 1);
		const marker = format === "bold" ? "**" : format === "italic" ? "*" : format === "strike" ? "~~" : format === "highlight" ? "==" : codeMarker;
		if (selected.includes("\n")) {
			const replacement = selected.split("\n").map((line) => line ? formatSelection(line, { start: 0, end: line.length }, format).text : line).join("\n");
			return { text: text.slice(0, start) + replacement + text.slice(end), selection: { start, end: start + replacement.length } };
		}
		const beforeStars = text.slice(0, start).match(/\*+$/)?.[0].length ?? 0;
		const afterStars = text.slice(end).match(/^\*+/)?.[0].length ?? 0;
		const surrounding = Math.min(beforeStars, afterStars);
		const removeMarkers = format === "bold" ? surrounding >= 2 : format === "italic" ? surrounding === 1 || surrounding === 3 :
			text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker;
		if (removeMarkers) {
			return {
				text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
				selection: { start: start - marker.length, end: end - marker.length },
			};
		}
		if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2 &&
			(format !== "italic" || !selected.startsWith("**"))) {
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
