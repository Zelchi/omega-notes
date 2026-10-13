export type TextRun = { text: string; bold?: boolean; italic?: boolean };
export type FormattedBlock = { kind: "paragraph" | "heading" | "separator"; level: number; runs: TextRun[]; text: string };
export type FormattedFragment = { block: FormattedBlock; start: number; end: number };
export const headingScales = [1, 2, 1.75, 1.5, 1.25, 1.125, 1] as const;

const inlineRuns = (text: string, bold = false, italic = false): TextRun[] => {
	const pattern = /(\[\[[^\]]+\]\]|(?:https?:\/\/|www\.)[^\s<*]+)|(\*\*\*([^\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|\*([^*\n]+?)\*)/g;
	const runs: TextRun[] = [];
	let cursor = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), bold, italic });
		if (match[1]) runs.push({ text: match[1], bold, italic });
		else runs.push(...inlineRuns(match[3] ?? match[4] ?? match[5] ?? "", bold || Boolean(match[3] || match[4]), italic || Boolean(match[3] || match[5])));
		cursor = match.index + match[0].length;
	}
	if (cursor < text.length) runs.push({ text: text.slice(cursor), bold, italic });
	return runs;
};

export const parseFormattedText = (text: string): FormattedBlock[] => text.split("\n").map((line) => {
	if (/^[ \t]*---[ \t]*$/.test(line)) return { kind: "separator", level: 0, runs: [], text: "" };
	const heading = line.match(/^(#{1,6})[ \t]+(.*)$/);
	const bullet = line.match(/^([ \t]*)-(?:[ \t]+(.*)|$)/);
	const content = heading ? heading[2]! : bullet ? `${bullet[1]}• ${bullet[2] ?? ""}` : line;
	const runs = inlineRuns(content);
	return { kind: heading ? "heading" : "paragraph", level: heading?.[1]?.length ?? 0, runs, text: runs.map((run) => run.text).join("") };
});

export const sliceTextRuns = (runs: TextRun[], start: number, end: number): TextRun[] => {
	let offset = 0;
	return runs.flatMap((run) => {
		const from = Math.max(0, start - offset);
		const to = Math.min(run.text.length, end - offset);
		offset += run.text.length;
		return to > from ? [{ ...run, text: run.text.slice(from, to) }] : [];
	});
};
