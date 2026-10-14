export type InlineTextFormat = "bold" | "italic" | "strike" | "highlight" | "code";
export type TextRun = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; highlight?: boolean; code?: boolean };
export type FormattedTable = { headers: TextRun[][]; rows: TextRun[][][]; alignments: ("left" | "center" | "right")[] };
export type FormattedBlock = { level: number; runs: TextRun[]; text: string; sourceLine: number; sourceLines: number; quote?: number; bullet?: { indent: string }; ordered?: { number: string; indent: string }; task?: { checked: boolean; indent: string; prefixLength: number } } &
	({ kind: "paragraph" | "heading" | "separator" | "code" } | { kind: "table"; table: FormattedTable });
export type FormattedFragment = { block: FormattedBlock; start: number; end: number };
export const codeFont = "ui-monospace, SFMono-Regular, Consolas, monospace";
export const headingScales = [1, 2, 1.75, 1.5, 1.25, 1.125, 1] as const;

const inlineRuns = (text: string, inherited: Omit<TextRun, "text"> = {}): TextRun[] => {
	// Protect complete code spans before parsing emphasis, including delimiters inside code.
	let tokenBoundary = "\u0000";
	while (text.includes(tokenBoundary)) tokenBoundary += "\u0000";
	const codes: string[] = [];
	const openings = /\[\[[^\]]+\]\]|(?:https?:\/\/|www\.)[^\s<*\x60]+|\x60+/g;
	let protectedText = "";
	let offset = 0;
	let opening: RegExpExecArray | null;
	while ((opening = openings.exec(text))) {
		if (!opening[0].startsWith("\x60")) continue;
		const closings = /\x60+/g;
		closings.lastIndex = openings.lastIndex;
		let closing: RegExpExecArray | null;
		while ((closing = closings.exec(text)) && closing[0].length !== opening[0].length) {}
		if (!closing || text.slice(openings.lastIndex, closing.index).includes("\n")) continue;
		protectedText += text.slice(offset, opening.index) + tokenBoundary + codes.length + tokenBoundary;
		codes.push(text.slice(openings.lastIndex, closing.index));
		offset = closing.index + closing[0].length;
		openings.lastIndex = offset;
	}
	protectedText += text.slice(offset);
	const parse = (value: string, flags: Omit<TextRun, "text">): TextRun[] => {
		const pattern = new RegExp(tokenBoundary + "(?<codeIndex>\\d+)" + tokenBoundary +
			String.raw`|(?<literal>\[\[[^\]]+\]\]|(?:https?:\/\/|www\.)[^\s<*\x60\x00]+)|\*\*\*(?<both>[^\n]+?)\*\*\*|\*\*(?<bold>[^\n]+?)\*\*|\*(?<italic>[^*\n]+?)\*|~~(?<strike>[^\n]+?)~~|==(?<highlight>[^\n]+?)==`, "g");
		const runs: TextRun[] = [];
		let cursor = 0;
		for (const match of value.matchAll(pattern)) {
			if (match.index > cursor) runs.push({ text: value.slice(cursor, match.index), ...flags });
			const groups = match.groups!;
			if (groups.codeIndex !== undefined) runs.push({ text: codes[Number(groups.codeIndex)]!, ...flags, code: true });
			else if (groups.literal !== undefined) runs.push({ text: groups.literal, ...flags });
			else runs.push(...parse(groups.both ?? groups.bold ?? groups.italic ?? groups.strike ?? groups.highlight ?? "", {
				...flags, bold: flags.bold || groups.both !== undefined || groups.bold !== undefined,
				italic: flags.italic || groups.both !== undefined || groups.italic !== undefined,
				strike: flags.strike || groups.strike !== undefined, highlight: flags.highlight || groups.highlight !== undefined,
			}));
			cursor = match.index + match[0].length;
		}
		if (cursor < value.length) runs.push({ text: value.slice(cursor), ...flags });
		return runs;
	};
	return parse(protectedText, inherited);
};

export const parseTableCells = (line: string): string[] => {
	const cells: string[] = [];
	let cell = "";
	let referenceEnd = -1;
	let lastDelimiter = -1;
	const value = line.trim();
	for (let index = 0; index < value.length; index++) {
		if (value[index] === "\\" && (value[index + 1] === "|" || value[index + 1] === "\\")) { cell += value[++index]; continue; }
		if (index > referenceEnd && value.startsWith("[[", index)) {
			const closing = value.indexOf("]]", index + 2);
			if (closing >= 0) referenceEnd = closing + 1;
		}
		if (value[index] === "|" && index > referenceEnd) { cells.push(cell.trim()); cell = ""; lastDelimiter = index; }
		else cell += value[index];
	}
	cells.push(cell.trim());
	if (value.startsWith("|")) cells.shift();
	if (lastDelimiter >= 0 && lastDelimiter === value.length - 1) cells.pop();
	return cells;
};

const isTableRow = (line: string, cells: string[]): boolean => {
	const value = line.trim();
	return cells.length > 1 || value.startsWith("|") || (value.endsWith("|") && !value.endsWith("\\|"));
};

export const parseFormattedText = (text: string): FormattedBlock[] => {
	const lines = text.split("\n");
	const blocks: FormattedBlock[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const fence = line.match(/^[ \t]*(`{3,})([^`]*?)\s*$/);
		if (fence) {
			const sourceLine = index;
			const contents: string[] = [];
			while (++index < lines.length) {
				const closing = lines[index]!.match(/^[ \t]*(`{3,})[ \t]*$/);
				if (closing && closing[1]!.length >= fence[1]!.length) break;
				contents.push(lines[index]!);
			}
			const sourceLines = Math.min(index + 1, lines.length) - sourceLine;
			blocks.push({ kind: "code", level: 0, runs: [], text: contents.join("\n"), sourceLine, sourceLines });
			continue;
		}

		const headers = line.includes("|") ? parseTableCells(line) : [];
		const delimiters = lines[index + 1]?.includes("|") ? parseTableCells(lines[index + 1]!) : [];
		if (headers.length && isTableRow(line, headers) && headers.length === delimiters.length && delimiters.every((cell) => /^:?-{3,}:?$/.test(cell))) {
			const sourceLine = index;
			const rows: TextRun[][][] = [];
			index++;
			while (lines[index + 1]?.includes("|") && lines[index + 1]!.trim()) {
				const nextLine = lines[index + 1]!;
				const cells = parseTableCells(nextLine);
				if (!isTableRow(nextLine, cells)) break;
				index++;
				rows.push(headers.map((_, column) => inlineRuns(cells[column] ?? "")));
			}
			const table: FormattedTable = {
				headers: headers.map((cell) => inlineRuns(cell)), rows,
				alignments: delimiters.map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left"),
			};
			blocks.push({ kind: "table", level: 0, runs: [], text: lines.slice(sourceLine, index + 1).join("\n"), sourceLine, sourceLines: index - sourceLine + 1, table });
			continue;
		}
		if (/^[ \t]*---[ \t]*$/.test(line)) {
			blocks.push({ kind: "separator", level: 0, runs: [], text: "", sourceLine: index, sourceLines: 1 });
			continue;
		}
		const task = line.match(/^([ \t]*)-[ \t]+\[([ xX]?)\](?:[ \t]+(.*)|$)/);
		if (task) {
			const indent = task[1]!;
			const prefix = indent + "\u2007\u2007 ";
			const runs = inlineRuns(prefix + (task[3] ?? ""));
			blocks.push({ kind: "paragraph", level: 0, runs, text: runs.map((run) => run.text).join(""), sourceLine: index, sourceLines: 1,
				task: { checked: /x/i.test(task[2]!), indent, prefixLength: prefix.length } });
			continue;
		}
		const quote = line.match(/^[ \t]*((?:>[ \t]?)+)(.*)$/);
		if (quote) {
			const runs = inlineRuns(quote[2]!);
			blocks.push({ kind: "paragraph", level: 0, runs, text: runs.map((run) => run.text).join(""), sourceLine: index, sourceLines: 1, quote: [...quote[1]!].filter((character) => character === ">").length });
			continue;
		}
		const ordered = line.match(/^([ \t]*)(\d+)\.[ \t]+(.*)$/);
		if (ordered) {
			const runs = inlineRuns(ordered[3]!);
			blocks.push({ kind: "paragraph", level: 0, runs, text: runs.map((run) => run.text).join(""), sourceLine: index, sourceLines: 1, ordered: { number: ordered[2]!, indent: ordered[1]! } });
			continue;
		}
		const heading = line.match(/^(#{1,6})[ \t]+(.*)$/);
		const bullet = line.match(/^([ \t]*)-(?:[ \t]+(.*)|$)/);
		const content = heading ? heading[2]! : bullet ? bullet[2] ?? "" : line;
		const runs = inlineRuns(content);
		blocks.push({ kind: heading ? "heading" : "paragraph", level: heading?.[1]?.length ?? 0, runs, text: runs.map((run) => run.text).join(""), sourceLine: index, sourceLines: 1, bullet: bullet && !heading ? { indent: bullet[1]! } : undefined });
	}
	return blocks;
};

export const sliceTextRuns = (runs: TextRun[], start: number, end: number): TextRun[] => {
	let offset = 0;
	return runs.flatMap((run) => {
		const from = Math.max(0, start - offset);
		const to = Math.min(run.text.length, end - offset);
		offset += run.text.length;
		return to > from ? [{ ...run, text: run.text.slice(from, to) }] : [];
	});
};

/** Apply changes to prose while retaining literal inline and fenced code. */
export const mapTextOutsideCode = (text: string, transform: (text: string) => string): string => {
	let fenceLength = 0;
	return text.split("\n").map((line) => {
		const fence = line.match(/^[ \t]*(`{3,})([^`]*?)\s*$/);
		if (fenceLength) {
			if (fence && !fence[2]!.trim() && fence[1]!.length >= fenceLength) fenceLength = 0;
			return line;
		}
		if (fence) { fenceLength = fence[1]!.length; return line; }
		let result = "";
		let offset = 0;
		const ticks = /`+/g;
		let opening: RegExpExecArray | null;
		while ((opening = ticks.exec(line))) {
			result += transform(line.slice(offset, opening.index));
			let closing: RegExpExecArray | null;
			while ((closing = ticks.exec(line)) && closing[0].length !== opening[0].length) {}
			if (!closing) return result + line.slice(opening.index);
			const end = closing.index + closing[0].length;
			result += line.slice(opening.index, end);
			offset = end;
		}
		return result + transform(line.slice(offset));
	}).join("\n");
};
