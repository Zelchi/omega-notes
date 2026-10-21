import { correctedPassage, decodeCorrectionSegments, type CorrectionSegment } from "./correction";
import { decodeClozeBlanks, fillClozeText } from "./cloze";
import { decodeStudyProgress, type StudyProgress } from "./progress";
export type StudyKind = "flashcards" | "quiz" | "written" | "cloze" | "correction";
export type StudyItem = { question: string; answer: string; options: string[]; correctIndex?: number; explanation: string; sources: string[]; blanks?: string[][]; segments?: CorrectionSegment[] };
/** Persisted records contain one item; controllers may combine records into an in-memory study run. */
export type StudyDeck = { id: string; kind: StudyKind; title: string; createdAt: number; sourceNoteId?: string; items: StudyItem[]; progress?: StudyProgress };

const object = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("STUDY_INVALID_RESPONSE");
	return value as Record<string, unknown>;
};
const text = (value: unknown, max: number): string => {
	if (typeof value !== "string" || !value.trim() || value.length > max) throw Error("STUDY_INVALID_RESPONSE");
	return value.trim();
};
export const decodeStudyItem = (raw: unknown, kind: StudyKind, allowedIds: ReadonlySet<string>): StudyItem => {
	const item = object(raw);
	if (!Array.isArray(item.sources) || item.sources.length < 1 || item.sources.length > 16 ||
		item.sources.some(id => typeof id !== "string" || !allowedIds.has(id))) throw Error("STUDY_INVALID_RESPONSE");
	const segments = kind === "correction" ? decodeCorrectionSegments(item.segments) : undefined;
	const result: StudyItem = { question: segments ? segments.map(segment => segment.text).join("").trim() : text(item.question, 2000), answer: "", options: [], explanation: "", sources: [...new Set(item.sources as string[])] };
	if (kind === "correction") {
		result.segments = segments!;
		result.answer = text(correctedPassage(segments!), 8000);
		result.explanation = text(item.explanation, 4000);
	} else if (kind === "cloze") {
		result.blanks = decodeClozeBlanks(result.question, item.blanks);
		result.answer = fillClozeText(result.question, result.blanks.map(answers => answers[0]));
		result.explanation = text(item.explanation, 4000);
	} else if (kind !== "quiz") result.answer = text(item.answer, 8000);
	else {
		if (!Array.isArray(item.options) || item.options.length !== 4 || !Number.isInteger(item.correctIndex) ||
			(item.correctIndex as number) < 0 || (item.correctIndex as number) > 3) throw Error("STUDY_INVALID_RESPONSE");
		result.options = item.options.map(option => text(option, 1000));
		if (new Set(result.options.map(option => option.toLocaleLowerCase())).size !== 4) throw Error("STUDY_INVALID_RESPONSE");
		result.correctIndex = item.correctIndex as number;
		result.explanation = text(item.explanation, 4000);
	}
	return result;
};
const decodeMaterial = (data: Record<string, unknown>, kind: StudyKind, allowedIds: ReadonlySet<string>, maximum: number): Pick<StudyDeck, "title" | "items"> => {
	if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > maximum) throw Error("STUDY_INVALID_RESPONSE");
	return { title: text(data.title, 200), items: data.items.map(raw => decodeStudyItem(raw, kind, allowedIds)) };
};

export class StudyItemCountError extends Error {
	readonly expected: number;
	readonly received: number;
	constructor(expected: number, received: number) {
		super("STUDY_ITEM_COUNT_MISMATCH");
		this.name = "StudyItemCountError";
		this.expected = expected;
		this.received = received;
	}
}

export class StudyInsufficientContentError extends Error {
	readonly noteIds: string[];
	constructor(noteIds: string[]) {
		super("STUDY_INSUFFICIENT_CONTENT");
		this.name = "StudyInsufficientContentError";
		this.noteIds = [...new Set(noteIds)];
	}
}

/** The response size limit applies to model output, not persisted learner reports. */
export const parseStudyJson = (response: string): Record<string, unknown> => {
	if (response.length > 512_000) throw Error("STUDY_INVALID_RESPONSE");
	const content = response.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```$/, "");
	return object(JSON.parse(content));
};
export const parseStudyResponse = (response: string, kind: StudyKind, allowedIds: ReadonlySet<string>, expected: number): Pick<StudyDeck, "title" | "items"> => {
	const data = parseStudyJson(response);
	if (data.error === "STUDY_INSUFFICIENT_CONTENT") {
		if (!Array.isArray(data.noteIds) || !data.noteIds.length || data.noteIds.length > expected || data.noteIds.some(id => typeof id !== "string" || !allowedIds.has(id))) throw Error("STUDY_INVALID_RESPONSE");
		throw new StudyInsufficientContentError(data.noteIds as string[]);
	}
	if (Array.isArray(data.items) && data.items.length !== expected) throw new StudyItemCountError(expected, data.items.length);
	return decodeMaterial(data, kind, allowedIds, expected);
};

export const decodeStudyDeck = (value: unknown): StudyDeck => {
	const data = object(value);
	if (typeof data.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) ||
		(data.kind !== "flashcards" && data.kind !== "quiz" && data.kind !== "written" && data.kind !== "cloze" && data.kind !== "correction") || !Number.isSafeInteger(data.createdAt) || (data.createdAt as number) < 0 || (data.createdAt as number) > 8_640_000_000_000_000 ||
		(data.sourceNoteId !== undefined && data.sourceNoteId !== null && typeof data.sourceNoteId !== "string") || !Array.isArray(data.items)) throw Error("STUDY_STORAGE_FAILED");
	const sources = new Set<string>();
	for (const raw of data.items) {
		const item = object(raw);
		if (!Array.isArray(item.sources) || item.sources.some(id => typeof id !== "string")) throw Error("STUDY_STORAGE_FAILED");
		for (const id of item.sources as string[]) sources.add(id);
	}
	const parsed = decodeMaterial(data, data.kind, sources, 1);
	if (data.kind !== "written" && data.kind !== "cloze" && data.progress && typeof data.progress === "object" && "responses" in data.progress && data.progress.responses != null) throw Error("STUDY_STORAGE_FAILED");
	const progress = data.progress == null ? undefined : decodeStudyProgress(data.progress, parsed.items.length);
	if (data.kind !== "flashcards" && progress?.items.some(item => item.lastRating !== undefined)) throw Error("STUDY_STORAGE_FAILED");
	for (const response of progress?.responses ?? []) {
		if (response.blankAnswers !== undefined || response.feedback?.blankResults !== undefined) {
			const item = parsed.items[response.itemIndex];
			if (data.kind !== "cloze" || !response.blankAnswers || response.blankAnswers.length !== item.blanks?.length ||
				(response.feedback && response.feedback.blankResults?.length !== response.blankAnswers.length) ||
				fillClozeText(item.question, response.blankAnswers.map(answer => answer || "____")) !== response.answer) throw Error("STUDY_STORAGE_FAILED");
		}
	}
	return { ...parsed, progress, id: data.id, kind: data.kind, createdAt: data.createdAt as number, sourceNoteId: typeof data.sourceNoteId === "string" ? data.sourceNoteId : undefined };
};
