import { decodeStudyProgress, type StudyProgress } from "./progress";
import type { StudyDeck, StudyKind } from "./study";

export type StudySummary = Pick<StudyDeck, "id" | "kind" | "createdAt" | "sourceNoteId"> & {
	itemCount: number; progress?: Pick<StudyProgress, "items">; hasReport: boolean;
};
export const studySummary = (deck: StudyDeck): StudySummary => ({
	id: deck.id, kind: deck.kind, createdAt: deck.createdAt, sourceNoteId: deck.sourceNoteId,
	itemCount: deck.items.length, progress: deck.progress ? { items: deck.progress.items } : undefined,
	hasReport: !!deck.progress?.responses?.length,
});
export const decodeStudySummary = (raw: unknown): StudySummary => {
	const fail = (): never => { throw Error("STUDY_STORAGE_FAILED"); };
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
	const value = raw as Record<string, unknown>;
	if (typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id) ||
		!["flashcards", "quiz", "written", "cloze", "correction"].includes(value.kind as string) ||
		!Number.isSafeInteger(value.createdAt) || (value.createdAt as number) < 0 || (value.createdAt as number) > 8_640_000_000_000_000 ||
		!Number.isInteger(value.itemCount) || (value.itemCount as number) < 1 || (value.itemCount as number) > 30 ||
		(value.sourceNoteId != null && typeof value.sourceNoteId !== "string") || typeof value.hasReport !== "boolean" ||
		(value.hasReport && value.kind !== "written" && value.kind !== "cloze")) return fail();
	const progress = value.progress == null ? undefined : decodeStudyProgress(value.progress, value.itemCount as number);
	if (progress?.responses !== undefined || value.kind !== "flashcards" && progress?.items.some(item => item.lastRating !== undefined)) return fail();
	return { id: value.id, kind: value.kind as StudyKind, createdAt: value.createdAt as number,
		sourceNoteId: typeof value.sourceNoteId === "string" ? value.sourceNoteId : undefined,
		itemCount: value.itemCount as number, progress, hasReport: value.hasReport };
};
