import { paragraphStarts } from "@/entities/note/model/text-alignment";
import { parseFormattedText } from "@/shared/lib/formatted-text";
import type { TextSelection } from "@/features/format-text";
import { EMPTY_CHARACTER } from "../../lib/editable-text-dom";

export const prepareTextReplacement = (
	rawValue: string,
	replacement: string,
	range: TextSelection,
	beforeTable: boolean,
	caretInReplacement?: number,
) => {
	const { start, end } = range;
	const value = rawValue.replaceAll(EMPTY_CHARACTER, "");
	const normalizedReplacement = replacement.replaceAll(EMPTY_CHARACTER, "");
	const insertion = normalizedReplacement + (beforeTable && normalizedReplacement && !normalizedReplacement.endsWith("\n") ? "\n" : "");
	const text = value.slice(0, start) + insertion + value.slice(end);
	let caret = start + (caretInReplacement ?? normalizedReplacement.length);
	if (!insertion && start < end && value[end - 1] === "\n") {
		const tableAtCaret = parseFormattedText(text).some((block) => block.kind === "table" && paragraphStarts(text)[block.sourceLine] === caret);
		if (tableAtCaret && caret > 0 && text[caret - 2] !== "\n") caret--;
	}
	return { text, caret, change: { start, end, length: insertion.length } };
};

export const remapSelectionForReplacement = (
	selection: TextSelection,
	range: TextSelection,
	replacementLength: number,
): TextSelection => {
	const delta = replacementLength - (range.end - range.start);
	const offset = (value: number) => value <= range.start ? value : value >= range.end
		? value + delta
		: range.start + Math.min(value - range.start, replacementLength);
	return { start: offset(selection.start), end: offset(selection.end) };
};
