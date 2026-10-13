import { parseFormattedText, sliceTextRuns, headingScales, type TextRun } from "@/features/format-text";
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
};

export const layoutFormattedText = (options: Options): TextFlowLayout => {
	const fragments: TextFlowFragment[] = [];
	let top = 0;
	let lineCount = 0;
	for (const [index, block] of parseFormattedText(options.text).entries()) {
		const scale = headingScales[block.level] ?? 1;
		const lineHeight = options.lineHeight * scale;
		const layout = layoutTextFlow({
			text: block.text,
			textX: options.x,
			textY: options.y + top,
			width: options.width,
			lineHeight,
			elements: options.elements,
			imageMargin: options.imageMargin,
			displayText: (value) => value,
			measureText: (value, start = 0) => sliceTextRuns(block.runs, start, start + value.length).reduce(
				(total, run) => total + options.measureRun({ ...run, text: options.displayText(run.text) }, scale, block.kind === "heading"), 0,
			),
		});
		fragments.push(...layout.fragments.map((fragment) => ({
			...fragment,
			alignment: options.paragraphAlignments?.[index] ?? options.alignment ?? "left",
			paragraphEnd: fragment.end >= block.text.length,
			top: fragment.top + top,
			fontScale: scale,
			lineHeight,
			format: { block, start: fragment.start, end: fragment.end },
		})));
		top += layout.height;
		lineCount += layout.lineCount;
	}
	return { fragments, height: top, lineCount };
};
