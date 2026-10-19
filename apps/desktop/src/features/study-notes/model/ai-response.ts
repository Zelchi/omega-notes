import { decodeStudyItem, parseStudyJson, parseWrittenFeedback, type StudyItem, type StudyKind, type WrittenFeedback } from "@/entities/study";

/** Wire references are local to a request; persisted models always use real note IDs. */
export const createSourceReferences = (ids: Iterable<string>): Map<string, string> => {
	const seen = new Set<string>(), references = new Map<string, string>();
	for (const id of ids) {
		if (seen.has(id)) continue;
		seen.add(id); references.set(`N${references.size + 1}`, id);
	}
	return references;
};
const invalid = (): never => { throw Error("STUDY_INVALID_RESPONSE"); };
const object = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
	return value as Record<string, unknown>;
};
const sourceIds = (value: unknown, references: ReadonlyMap<string, string>, allowedIds: ReadonlySet<string>): string[] => {
	if (!Array.isArray(value) || !value.length || value.length > 16) return invalid();
	return value.map(reference => {
		const id = typeof reference === "string" ? references.get(reference) : undefined;
		if (!id || !allowedIds.has(id)) return invalid();
		return id;
	});
};

/** Convert the AI's simple wire shape before invoking the shared internal validator. */
export const decodeGeneratedItem = (raw: Record<string, unknown>, kind: StudyKind,
	references: ReadonlyMap<string, string>, allowedIds: ReadonlySet<string>): StudyItem => {
	const value = { ...raw, sources: sourceIds(raw.sources, references, allowedIds) };
	if (kind === "cloze") {
		if (!Array.isArray(raw.parts) || !raw.parts.length || raw.parts.length > 21) return invalid();
		const blanks: unknown[] = [];
		const question = raw.parts.map(part => {
			if (typeof part === "string") {
				if (part.length > 2000 || part.includes("{{") || part.includes("}}")) return invalid();
				return part;
			}
			const blank = object(part);
			if (Object.keys(blank).some(key => key !== "answers")) return invalid();
			blanks.push(blank.answers);
			if (blanks.length > 5) return invalid();
			return `{{${blanks.length}}}`;
		}).join("");
		return decodeStudyItem({ ...value, question, blanks }, kind, allowedIds);
	}
	if (kind === "quiz") {
		if (!Array.isArray(raw.distractors) || raw.distractors.length !== 3) return invalid();
		const item = decodeStudyItem({ ...value, options: [raw.answer, ...raw.distractors], correctIndex: 0 }, kind, allowedIds);
		const order = [0, 1, 2, 3];
		for (let index = order.length - 1; index > 0; index--) {
			const other = Math.floor(Math.random() * (index + 1));
			[order[index], order[other]] = [order[other], order[index]];
		}
		return { ...item, options: order.map(index => item.options[index]), correctIndex: order.indexOf(0) };
	}
	return decodeStudyItem(value, kind, allowedIds);
};

/** Keep persistence validation strict while deriving redundant values only at the wire boundary. */
export const parseGeneratedFeedback = (response: string, references: ReadonlyMap<string, string>, blankCount?: number): WrittenFeedback => {
	if (response.length > 64_000) return invalid();
	const data = parseStudyJson(response), allowedIds = new Set(references.values());
	let correct = data.correct;
	if (blankCount !== undefined) {
		if (!Array.isArray(data.blankResults) || data.blankResults.length !== blankCount ||
			data.blankResults.some(value => typeof value !== "boolean")) return invalid();
		correct = data.blankResults.every(Boolean);
	} else if (data.blankResults !== undefined) return invalid();
	const findings = (value: unknown) => {
		if (!Array.isArray(value) || value.length > 8) return invalid();
		return value.map(raw => {
			const entry = object(raw);
			return { text: entry.text, sources: sourceIds(entry.sources, references, allowedIds) };
		});
	};
	return parseWrittenFeedback(JSON.stringify({
		correct, blankResults: data.blankResults, summary: data.summary,
		strengths: findings(data.strengths), gaps: findings(data.gaps), corrections: findings(data.corrections),
	}), allowedIds, blankCount);
};
