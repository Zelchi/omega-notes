import { paragraphStarts } from "@/entities/note";

export const toggleMarkdownTask = (
	text: string,
	sourceLine: number,
	checked: boolean,
): { text: string; start: number; end: number; replacementLength: number } | undefined => {
	const line = text.split("\n")[sourceLine];
	const marker = line?.match(/^([ \t]*-[ \t]+)\[([ xX]?)\](?=[ \t]|$)/);
	if (!line || !marker) return undefined;
	const start = (paragraphStarts(text)[sourceLine] ?? 0) + marker[1]!.length;
	const end = start + marker[2]!.length + 2;
	const replacement = checked ? "[x]" : "[ ]";
	return {
		text: text.slice(0, start) + replacement + text.slice(end),
		start,
		end,
		replacementLength: replacement.length,
	};
};
