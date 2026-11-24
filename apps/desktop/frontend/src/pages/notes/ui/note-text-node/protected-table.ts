import type { TextSelection } from "@/features/format-text";
import type { TextFlowFragment } from "../../lib/text-flow-layout";

type TableFragment = Pick<TextFlowFragment, "start" | "end" | "format">;

export const touchesProtectedTable = (
	text: string,
	fragments: TableFragment[],
	range: TextSelection,
	replacement = "",
): boolean => range.start < range.end && fragments.some((fragment) => {
	if (fragment.format?.block.kind !== "table") return false;
	if (range.start < fragment.end && range.end > fragment.start) return true;
	if (range.end !== fragment.start || range.start >= fragment.start) return false;
	const before = text.slice(0, range.start) + replacement;
	return Boolean(before) && !before.endsWith("\n");
});

export const expandDeletionRange = (text: string, inputType: string, range: TextSelection): TextSelection => {
	const deletion = { ...range };
	if (deletion.start !== deletion.end || !/Word|Line/.test(inputType)) return deletion;
	const backward = inputType.endsWith("Backward");
	if (/Word/.test(inputType)) {
		if (backward) deletion.start -= text.slice(0, deletion.start).match(/\s*\S+\s*$/)?.[0].length ?? 0;
		else deletion.end += text.slice(deletion.end).match(/^\s*\S+\s*/)?.[0].length ?? 0;
	} else if (backward) deletion.start = text.lastIndexOf("\n", deletion.start - 1) + 1;
	else {
		const newline = text.indexOf("\n", deletion.end);
		deletion.end = newline < 0 ? text.length : newline + 1;
	}
	return deletion;
};
