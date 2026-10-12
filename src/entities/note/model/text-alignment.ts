import type { NoteTextAlignment } from "./note-document";

export const paragraphStarts = (text: string): number[] => {
	const starts = [0];
	for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") starts.push(index + 1);
	return starts;
};

export const paragraphIndexAt = (starts: number[], offset: number): number => {
	let low = 0;
	let high = starts.length - 1;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (starts[middle]! <= offset) low = middle;
		else high = middle - 1;
	}
	return low;
};

export const remapParagraphAlignments = (
	previous: string, next: string, alignments: NoteTextAlignment[] | undefined, fallback: NoteTextAlignment,
	change?: { start: number; end: number; length: number },
): NoteTextAlignment[] | undefined => {
	if (!alignments?.length) return alignments;
	const oldStarts = paragraphStarts(previous);
	const newStarts = paragraphStarts(next);
	if (oldStarts.length === newStarts.length) return [...alignments];
	let prefix = change?.start ?? 0;
	let oldEnd = change?.end ?? previous.length;
	let newEnd = change ? change.start + change.length : next.length;
	if (!change) {
		while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
		while (oldEnd > prefix && newEnd > prefix && previous[oldEnd - 1] === next[newEnd - 1]) {
			oldEnd -= 1;
			newEnd -= 1;
		}
	}
	return newStarts.map((start) => {
		const original = start <= prefix ? start : start < newEnd ? prefix : oldEnd + start - newEnd;
		return alignments[paragraphIndexAt(oldStarts, original)] ?? fallback;
	});
};
