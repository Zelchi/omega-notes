import { formatSelection, type TextFormat, type TextSelection } from "@/features/format-text";

export const prepareTextFormatting = (
	text: string,
	selection: TextSelection,
	format: TextFormat,
	options: { atTableBoundary?: boolean; tableColumnLabel?: string } = {},
): { text: string; selection: TextSelection } => {
	const value = options.atTableBoundary && selection.start === selection.end
		? text.slice(0, selection.start) + "\n" + text.slice(selection.start)
		: text;
	return formatSelection(value, selection, format, { tableColumnLabel: options.tableColumnLabel });
};
