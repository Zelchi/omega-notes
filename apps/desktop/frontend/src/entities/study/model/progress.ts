import { decodeWrittenReport, type WrittenReportEntry } from "./written-report";
/** A identidade do item é sua posição imutável dentro de um baralho gerado, associada ao ID do baralho. */
export type StudyOutcome = "correct" | "wrong" | "timeout" | "skipped";
export type FlashcardRating = "easy" | "medium" | "hard";
export type ItemProgress = {
	itemIndex: number; attempts: number; correct: number; timeouts: number;
	lastOutcome: StudyOutcome; lastReviewedAt: number; dueAt: number;
	intervalDays: number; streak: number; lastRating?: FlashcardRating;
};
export type StudyProgress = { items: ItemProgress[]; responses?: WrittenReportEntry[] };
const DAY = 86_400_000;
const MAX_COUNTER = 1_000_000;
const increment = (value = 0) => Math.min(MAX_COUNTER, value + 1);

/** Intervalo determinístico simples: 1, 3, 7, 14, 30, 60, 120 e depois 180 dias.
 * Um card errado zera a sequência e retorna após dez minutos. */
export const recordStudyOutcome = (progress: StudyProgress | undefined, itemIndex: number, outcome: StudyOutcome, now: number): StudyProgress => {
	const previous = progress?.items.find(item => item.itemIndex === itemIndex);
	const streak = outcome === "correct" ? increment(previous?.streak) : 0;
	const intervals = [1, 3, 7, 14, 30, 60, 120, 180];
	const intervalDays = streak ? intervals[Math.min(streak - 1, intervals.length - 1)] : 0;
	const next: ItemProgress = {
		itemIndex, attempts: increment(previous?.attempts),
		correct: outcome === "correct" && (previous?.attempts ?? 0) < MAX_COUNTER ? increment(previous?.correct) : previous?.correct ?? 0,
		timeouts: outcome === "timeout" && (previous?.attempts ?? 0) < MAX_COUNTER ? increment(previous?.timeouts) : previous?.timeouts ?? 0,
		lastOutcome: outcome, lastReviewedAt: now, dueAt: now + (streak ? intervalDays * DAY : 600_000), intervalDays, streak,
	};
	return { ...progress, items: [...(progress?.items.filter(item => item.itemIndex !== itemIndex) ?? []), next] };
};
/** A dificuldade altera o agendamento independentemente das regras do questionário e da redação. */
export const flashcardInterval = (progress: StudyProgress | undefined, itemIndex: number, rating: FlashcardRating): number => {
	if (rating === "hard") return 30 * 60_000;
	const previous = progress?.items.find(item => item.itemIndex === itemIndex)?.intervalDays ?? 0;
	const days = rating === "easy" ? Math.max(5, previous * 3) : Math.max(1, previous * 2);
	return Math.min(180, days) * DAY;
};
export const recordFlashcardRating = (progress: StudyProgress | undefined, itemIndex: number, rating: FlashcardRating, now: number): StudyProgress => {
	const interval = flashcardInterval(progress, itemIndex, rating);
	const next = recordStudyOutcome(progress, itemIndex, rating === "easy" ? "correct" : "wrong", now);
	return { ...next, items: next.items.map(item => item.itemIndex === itemIndex
		? { ...item, lastRating: rating, intervalDays: Math.floor(interval / DAY), dueAt: now + interval } : item) };
};
export const dueStudyIndices = (length: number, progress: StudyProgress | undefined, now: number): number[] =>
	Array.from({ length }, (_, index) => index).filter(index => {
		const item = progress?.items.find(item => item.itemIndex === index);
		return !item || item.dueAt <= now;
	});
export const incorrectStudyIndices = (progress?: StudyProgress): number[] =>
	progress?.items.filter(item => item.lastOutcome !== "correct").map(item => item.itemIndex).sort((a, b) => a - b) ?? [];

export const decodeStudyProgress = (value: unknown, itemCount: number): StudyProgress => {
	const fail = (): never => { throw Error("STUDY_STORAGE_FAILED"); };
	if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items) || value.items.length > itemCount) return fail();
	const seen = new Set<number>();
	const items = value.items.map((raw: unknown): ItemProgress => {
		if (!raw || typeof raw !== "object") return fail();
		const item = raw as ItemProgress;
		const counters = [item.attempts, item.correct, item.timeouts, item.streak];
		if (!Number.isInteger(item.itemIndex) || item.itemIndex < 0 || item.itemIndex >= itemCount || seen.has(item.itemIndex) ||
			counters.some(value => !Number.isInteger(value) || value < 0 || value > MAX_COUNTER) || item.attempts < 1 ||
			item.correct + item.timeouts > item.attempts || item.streak > item.attempts ||
			!["correct", "wrong", "timeout", "skipped"].includes(item.lastOutcome) ||
			![item.lastReviewedAt, item.dueAt].every(value => Number.isSafeInteger(value) && value >= 0) || item.dueAt < item.lastReviewedAt ||
			!Number.isInteger(item.intervalDays) || item.intervalDays < 0 || item.intervalDays > 180) return fail();
		if (item.lastRating !== undefined && (!["easy", "medium", "hard"].includes(item.lastRating) || (item.lastOutcome === "timeout" || item.lastOutcome === "skipped"))) return fail();
		seen.add(item.itemIndex);
		return { itemIndex: item.itemIndex, attempts: item.attempts, correct: item.correct, timeouts: item.timeouts,
			streak: item.streak, lastOutcome: item.lastOutcome, lastReviewedAt: item.lastReviewedAt, dueAt: item.dueAt, intervalDays: item.intervalDays, lastRating: item.lastRating };
	});
	const responses = "responses" in value && value.responses != null ? decodeWrittenReport(value.responses, itemCount) : undefined;
	if (responses?.some(entry => !items.some(item => item.itemIndex === entry.itemIndex && item.lastOutcome === entry.outcome))) return fail();
	return { items, responses };
};
