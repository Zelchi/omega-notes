import type { StudyOutcome } from "./progress";

export type WrittenFinding = { text: string; sources: string[] };
export type WrittenFeedback = { correct: boolean; summary: string; strengths: WrittenFinding[]; gaps: WrittenFinding[]; corrections: WrittenFinding[]; blankResults?: boolean[] };
const invalid = (): never => { throw Error("STUDY_INVALID_RESPONSE"); };
const object = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
	return value as Record<string, unknown>;
};
const text = (value: unknown, maximum: number) => {
	if (typeof value !== "string" || !value.trim() || value.length > maximum) return invalid();
	return value.trim();
};
export const parseWrittenFeedback = (response: string, allowedIds: ReadonlySet<string>, blankCount?: number): WrittenFeedback => {
	if (response.length > 64_000) return invalid();
	const content = response.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```$/, "");
	const data = object(JSON.parse(content));
	if (typeof data.correct !== "boolean") return invalid();
	let blankResults: boolean[] | undefined;
	if (data.blankResults != null || blankCount !== undefined) {
		if (!Array.isArray(data.blankResults) || data.blankResults.length < 1 || data.blankResults.length > 5 ||
			(blankCount !== undefined && data.blankResults.length !== blankCount) || data.blankResults.some(value => typeof value !== "boolean") ||
			data.correct !== data.blankResults.every(Boolean)) return invalid();
		blankResults = [...data.blankResults] as boolean[];
	}
	const findings = (value: unknown): WrittenFinding[] => {
		if (!Array.isArray(value) || value.length > 8) return invalid();
		return value.map(raw => {
			const item = object(raw);
			if (!Array.isArray(item.sources) || item.sources.length < 1 || item.sources.length > 16 ||
				item.sources.some(id => typeof id !== "string" || !allowedIds.has(id))) return invalid();
			return { text: text(item.text, 2000), sources: [...new Set(item.sources as string[])] };
		});
	};
	return { correct: data.correct, blankResults, summary: text(data.summary, 3000), strengths: findings(data.strengths), gaps: findings(data.gaps), corrections: findings(data.corrections) };
};

export type WrittenReportEntry = {
	itemIndex: number; answer: string; outcome: StudyOutcome; reviewedAt: number;
	feedback?: WrittenFeedback; blankAnswers?: string[];
};
export type StudySubmission = { answer: string; blankAnswers?: string[] };

export const decodeWrittenReport = (value: unknown, itemCount: number): WrittenReportEntry[] => {
	if (!Array.isArray(value) || value.length > itemCount) return invalid();
	const seen = new Set<number>();
	return value.map(raw => {
		const entry = object(raw);
		if (!Number.isInteger(entry.itemIndex) || (entry.itemIndex as number) < 0 || (entry.itemIndex as number) >= itemCount || seen.has(entry.itemIndex as number) ||
			typeof entry.answer !== "string" || entry.answer.length > 4000 || !["correct", "wrong", "timeout", "skipped"].includes(entry.outcome as string) ||
			!Number.isSafeInteger(entry.reviewedAt) || (entry.reviewedAt as number) < 0) return invalid();
		seen.add(entry.itemIndex as number);
		let blankAnswers: string[] | undefined;
		if (entry.blankAnswers != null) {
			if (!Array.isArray(entry.blankAnswers) || !entry.blankAnswers.length || entry.blankAnswers.length > 5 || entry.blankAnswers.some(answer => typeof answer !== "string" || answer.length > 200)) return invalid();
			blankAnswers = [...entry.blankAnswers] as string[];
		}
		let feedback: WrittenFeedback | undefined;
		if (entry.feedback != null) {
			const data = object(entry.feedback), ids = new Set<string>();
			for (const key of ["strengths", "gaps", "corrections"]) {
				if (!Array.isArray(data[key])) return invalid();
				for (const raw of data[key]) {
					const finding = object(raw);
					if (!Array.isArray(finding.sources)) return invalid();
					for (const id of finding.sources) {
						if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return invalid();
						ids.add(id);
					}
				}
			}
			feedback = parseWrittenFeedback(JSON.stringify(data), ids, blankAnswers?.length);
		}
		if ((entry.outcome === "timeout" || entry.outcome === "skipped") ? feedback !== undefined : !feedback || feedback.correct !== (entry.outcome === "correct")) return invalid();
		return { itemIndex: entry.itemIndex as number, answer: entry.answer, outcome: entry.outcome as StudyOutcome, reviewedAt: entry.reviewedAt as number, feedback, blankAnswers };
	});
};
