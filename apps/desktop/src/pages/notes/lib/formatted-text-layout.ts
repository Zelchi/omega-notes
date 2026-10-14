import { parseFormattedText, sliceTextRuns, headingScales, type TextRun, type FormattedBlock } from "@/features/format-text";
import type { NotePositionedElement, NoteTextAlignment } from "@/entities/note";
import { layoutTextFlow, type TextFlowFragment, type TextFlowLayout } from "./text-flow-layout";

type Options = {
	text: string;
	x: number;
	y: number;
	width: number;
	lineHeight: number;
	elements: NotePositionedElement[];
	imageMargin: number;
	measureRun: (run: TextRun, scale: number, heading: boolean) => number;
	displayText: (text: string) => string;
	paragraphAlignments?: NoteTextAlignment[];
	alignment?: NoteTextAlignment;
	tableHeights?: Record<number, number>;
	rawText?: boolean;
	measureRawText?: (text: string, start?: number) => number;
};

export const layoutFormattedText = (options: Options): TextFlowLayout => {
	const fragments: TextFlowFragment[] = [];
	let top = 0;
	let lineCount = 0;
	const lines = options.text.split("\n");
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) { starts.push(offset); offset += line.length + 1; }
	const parsed = parseFormattedText(options.text);
	const blocks = options.rawText ? parsed.flatMap<FormattedBlock>((block) => block.kind === "table" ? [block] :
		Array.from({ length: block.sourceLines }, (_, index) => ({
			kind: "paragraph" as const, level: 0, sourceLine: block.sourceLine + index, sourceLines: 1,
			text: lines[block.sourceLine + index]!, runs: [{ text: lines[block.sourceLine + index]! }],
		}))) : parsed;
	for (const block of blocks) {
		const start = starts[block.sourceLine]!;
		const hasNewline = block.sourceLine + block.sourceLines < lines.length;
		if (block.kind === "table" || block.kind === "code") {
			if (block.kind === "table" && options.rawText && (block.sourceLine === 0 || lines[block.sourceLine - 1] === "")) {
				fragments.push({ start, end: start, text: "", left: 0, top, width: options.width, beforeTable: true });
				top += options.lineHeight;
				lineCount++;
			}
			const height = options.tableHeights?.[block.sourceLine] ?? (block.kind === "table"
				? (block.table.rows.length + 1) * (options.lineHeight + 13) + 1 + (options.rawText ? 42 : 0)
				: Math.max(1, block.text.split("\n").length) * options.lineHeight + 18);
			let previousTop: number;
			do {
				previousTop = top;
				for (const element of options.elements) {
					if (element.x + element.width + options.imageMargin <= options.x || element.x - options.imageMargin >= options.x + options.width) continue;
					if (element.y - options.imageMargin < options.y + top + height && element.y + element.height + options.imageMargin > options.y + top) {
						top = Math.max(top, element.y + element.height + options.imageMargin - options.y);
					}
				}
			} while (top > previousTop);
			fragments.push({ start: options.rawText ? start : 0, end: options.rawText ? start + block.text.length + Number(hasNewline) : block.text.length, text: block.text + (options.rawText && hasNewline ? "\n" : ""), left: 0, top, width: options.width, lineHeight: options.lineHeight, format: { block, start: 0, end: block.text.length } });
			top += height;
			lineCount += block.kind === "table" ? block.table.rows.length + 1 : Math.max(1, block.text.split("\n").length);
			continue;
		}
		const scale = headingScales[block.level] ?? 1;
		const lineHeight = options.lineHeight * scale;
		const inset = block.quote ? block.quote * 12 + 3 : block.ordered
			? options.measureRun({ text: `${block.ordered.indent}${block.ordered.number}. ` }, 1, false)
			: block.bullet ? options.measureRun({ text: `${block.bullet.indent}• ` }, 1, false) : 0;
		const layout = layoutTextFlow({
			text: block.text,
			textX: options.x + inset,
			textY: options.y + top,
			width: Math.max(1, options.width - inset),
			lineHeight,
			elements: options.elements,
			imageMargin: options.imageMargin,
			displayText: (value) => value,
			measureText: (value, start = 0) => options.rawText && options.measureRawText ? options.measureRawText(value, start) : sliceTextRuns(block.runs, start, start + value.length).reduce(
				(total, run) => total + options.measureRun({ ...run, text: options.displayText(run.text) }, scale, block.kind === "heading"), 0,
			),
		});
		fragments.push(...layout.fragments.map((fragment, index) => ({
			...fragment,
			left: fragment.left + (block.ordered || block.bullet ? inset : 0),
			width: fragment.width + (block.quote ? inset : 0),
			start: options.rawText ? start + fragment.start : fragment.start,
			end: options.rawText ? start + fragment.end + Number(hasNewline && index === layout.fragments.length - 1) : fragment.end,
			text: fragment.text + (options.rawText && hasNewline && index === layout.fragments.length - 1 ? "\n" : ""),
			alignment: options.paragraphAlignments?.[block.sourceLine] ?? options.alignment ?? "left",
			paragraphEnd: fragment.end >= block.text.length,
			top: fragment.top + top,
			fontScale: scale,
			lineHeight,
			format: { block, start: fragment.start, end: fragment.end },
		})));
		top += layout.height;
		lineCount += layout.lineCount;
	}
	if (options.rawText && blocks.at(-1)?.kind === "table") {
		fragments.push({ start: options.text.length, end: options.text.length, text: "", left: 0, top, width: options.width });
		top += options.lineHeight;
		lineCount++;
	}
	return { fragments, height: top, lineCount };
};
