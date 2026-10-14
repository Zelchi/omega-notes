import { externalLinkUrl, readExternalMarkdownLink } from "@/shared/lib/external-links";

export type NoteTextLink = {
	start: number;
	end: number;
	label: string;
} & ({ kind: "note"; target: string; alias?: string } | { kind: "external"; url: string });

const splitTrailingPunctuation = (value: string): [string, string] => {
	let end = value.length;
	while (/[.,!?;:'"“”‘’]/u.test(value[end - 1] ?? "")) end -= 1;
	for (const [closing, opening] of [[")", "("], ["]", "["], ["}", "{"]] as const) {
		while (value[end - 1] === closing) {
			const candidate = value.slice(0, end);
			const openCount = [...candidate].filter((character) => character === opening).length;
			const closeCount = [...candidate].filter((character) => character === closing).length;
			if (closeCount <= openCount) break;
			end -= 1;
		}
	}
	return [value.slice(0, end), value.slice(end)];
};

export const parseNoteTextLinks = (text: string): NoteTextLink[] => {
	const links: NoteTextLink[] = [];
	const pattern = /\[\[[^\]]+\]\]|\[(?!\[)|(?:https?:\/\/|www\.)[^\s<]+/gi;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text))) {
		const start = match.index;
		const value = match[0];
		if (value.startsWith("[[")) {
			const body = value.slice(2, -2);
			const separator = body.indexOf("|");
			const target = (separator < 0 ? body : body.slice(0, separator)).trim();
			const label = (separator < 0 ? target : body.slice(separator + 1)).trim();
			links.push({ start, end: start + value.length, kind: "note", target, label, alias: separator < 0 ? undefined : label });
			continue;
		}
		if (value.startsWith("[")) {
			const link = readExternalMarkdownLink(text, start);
			if (link) {
				links.push({ ...link, kind: "external" });
				pattern.lastIndex = link.end;
			}
			continue;
		}
		const [label] = splitTrailingPunctuation(value);
		const url = externalLinkUrl(label);
		if (!url) continue;
		links.push({ start, end: start + label.length, kind: "external", url, label });
	}
	return links;
};
