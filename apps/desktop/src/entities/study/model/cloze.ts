/** Keep punctuation and numbers significant; only case, diacritics and spacing are normalized. */
export const normalizeClozeAnswer = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/gu, " ");
export type ClozePart = { text: string; blankIndex?: number };
export const splitClozeText = (text: string): ClozePart[] => {
	const parts: ClozePart[] = [];
	let offset = 0;
	for (const match of text.matchAll(/\{\{([1-5])\}\}/g)) {
		parts.push({ text: text.slice(offset, match.index) }, { text: "", blankIndex: Number(match[1]) - 1 });
		offset = match.index! + match[0].length;
	}
	parts.push({ text: text.slice(offset) });
	return parts;
};
export const fillClozeText = (text: string, answers: readonly string[]): string => text.replace(/\{\{([1-5])\}\}/g, (marker, number: string) => answers[Number(number) - 1] ?? marker);
export const decodeClozeBlanks = (question: string, value: unknown): string[][] => {
	const invalid = (): never => { throw Error("STUDY_INVALID_RESPONSE"); };
	if (!Array.isArray(value) || value.length < 1 || value.length > 5) return invalid();
	const markers = [...question.matchAll(/\{\{([^{}]*)\}\}/g)];
	const prose = question.replace(/\{\{[^{}]*\}\}/g, "");
	if (markers.length !== value.length || markers.some((match, index) => match[1] !== String(index + 1)) || !prose.trim() || prose.includes("{{") || prose.includes("}}")) return invalid();
	return value.map(alternatives => {
		if (!Array.isArray(alternatives) || alternatives.length < 1 || alternatives.length > 5 || alternatives.some(answer => typeof answer !== "string" || answer.length > 200 || !normalizeClozeAnswer(answer))) return invalid();
		const seen = new Set<string>();
		return (alternatives as string[]).map(answer => answer.trim()).filter(answer => {
			const normalized = normalizeClozeAnswer(answer);
			if (seen.has(normalized)) return false;
			seen.add(normalized); return true;
		});
	});
};
