export type CorrectionSegment = { text: string; incorrect: boolean; correction?: string };

/** Os segmentos cobrem todo o trecho; afirmações verdadeiras e falsas continuam selecionáveis. */
export const decodeCorrectionSegments = (value: unknown): CorrectionSegment[] => {
	const invalid = () => { throw Error("STUDY_INVALID_RESPONSE"); };
	if (!Array.isArray(value) || value.length < 3 || value.length > 16) return invalid();
	const segments = value.map(raw => {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
		const segment = raw as Record<string, unknown>;
		if (typeof segment.text !== "string" || !segment.text.trim() || segment.text.length > 1000 || typeof segment.incorrect !== "boolean") return invalid();
		if (segment.incorrect) {
			if (typeof segment.correction !== "string" || !segment.correction.trim() || segment.correction.length > 1000 || segment.correction.trim() === segment.text.trim()) return invalid();
			return { text: segment.text, incorrect: true, correction: segment.correction };
		}
		if (segment.correction != null) return invalid();
		return { text: segment.text, incorrect: false };
	});
	const errors = segments.filter(segment => segment.incorrect).length;
	if (!errors || errors === segments.length || segments.map(segment => segment.text).join("").trim().length > 2000) return invalid();
	return segments;
};
export const correctedPassage = (segments: CorrectionSegment[]): string =>
	segments.map(segment => segment.incorrect ? segment.correction! : segment.text).join("").trim();
