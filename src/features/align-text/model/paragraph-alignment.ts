import { paragraphStarts, paragraphIndexAt, type NoteTextAlignment, type NoteTextElement } from "@/entities/note";

export type ParagraphAlignmentHandler = (alignment: NoteTextAlignment) => void;
type Selection = { start: number; end: number };

const selectedParagraphs = (text: string, selection: Selection) => {
	const starts = paragraphStarts(text);
	const start = Math.max(0, Math.min(text.length, selection.start));
	const end = Math.max(start, Math.min(text.length, selection.end));
	return { starts, first: paragraphIndexAt(starts, start), last: paragraphIndexAt(starts, end > start ? end - 1 : end) };
};

export const selectionAlignment = (element: NoteTextElement, selection: Selection): NoteTextAlignment | undefined => {
	const { first, last } = selectedParagraphs(element.text, selection);
	const alignment = element.paragraphAlignments?.[first] ?? element.alignment;
	for (let index = first + 1; index <= last; index += 1) {
		if ((element.paragraphAlignments?.[index] ?? element.alignment) !== alignment) return undefined;
	}
	return alignment;
};

export const alignParagraphSelection = (element: NoteTextElement, selection: Selection, alignment: NoteTextAlignment): NoteTextElement => {
	const { starts, first, last } = selectedParagraphs(element.text, selection);
	const paragraphAlignments = starts.map((_, index) => index >= first && index <= last
		? alignment : element.paragraphAlignments?.[index] ?? element.alignment);
	return { ...element, paragraphAlignments };
};
