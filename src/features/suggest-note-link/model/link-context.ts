export type NoteLinkContext = {
	start: number;
	end: number;
	query: string;
	alias: string;
	key: string;
};

export const noteLinkAtCaret = (text: string, offset: number | undefined): NoteLinkContext | undefined => {
	if (offset === undefined || offset < 2 || offset > text.length) return;
	const start = text.lastIndexOf("[[", offset - 1);
	if (start < 0 || offset < start + 2) return;
	const close = text.indexOf("]]", start + 2);
	if (close < offset) return;
	const body = text.slice(start + 2, close);
	if (/[\[\]\r\n]/.test(body)) return;
	const separator = body.indexOf("|");
	const targetEnd = separator < 0 ? close : start + 2 + separator;
	if (offset > targetEnd) return;
	const query = text.slice(start + 2, targetEnd).trim();
	return {
		start, end: close + 2, query,
		alias: separator < 0 ? "" : body.slice(separator),
		key: `${start}:${close}:${offset}:${body}`,
	};
};
