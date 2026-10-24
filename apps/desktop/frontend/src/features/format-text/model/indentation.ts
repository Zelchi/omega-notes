import type { TextSelection } from "./formatting";

const INDENT = "    ";

export const indentSelection = (text: string, selection: TextSelection, remove = false) => {
    const start = Math.max(0, Math.min(selection.start, text.length));
    const end = Math.max(start, Math.min(selection.end, text.length));
    if (!remove && start === end) {
        const caret = start + INDENT.length;
        return { text: text.slice(0, start) + INDENT + text.slice(end), selection: { start: caret, end: caret },
            change: { start, end, length: INDENT.length }, replacement: INDENT };
    }
    const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const newline = text.indexOf("\n", last);
    const lineEnd = newline < 0 ? text.length : newline;
    const lines = text.slice(lineStart, lineEnd).split("\n").map((line) => {
        const removed = remove ? line.startsWith("\t") ? 1 : line.match(/^ {1,4}/)?.[0].length ?? 0 : 0;
        return { original: line, text: remove ? line.slice(removed) : INDENT + line, removed };
    });
    const replacement = lines.map((line) => line.text).join("\n");
    const mapOffset = (offset: number) => {
        let oldCursor = lineStart;
        let newCursor = lineStart;
        for (const line of lines) {
            if (offset <= oldCursor + line.original.length) {
                return newCursor + (remove ? Math.max(0, offset - oldCursor - line.removed) : offset - oldCursor + INDENT.length);
            }
            oldCursor += line.original.length + 1;
            newCursor += line.text.length + 1;
        }
        return lineStart + replacement.length + offset - lineEnd;
    };
    return { text: text.slice(0, lineStart) + replacement + text.slice(lineEnd),
        selection: { start: mapOffset(start), end: mapOffset(end) },
        change: { start: lineStart, end: lineEnd, length: replacement.length }, replacement };
};
