import { batch, createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import type { StudyItem, StudyOutcome, StudySubmission, WrittenFeedback } from "@/entities/study";
import type { StudyEnvironment } from "./environment";
import { createEvaluationContextCache } from "./evaluation-context";
import { parseGeneratedFeedback } from "./ai-response";

export type StudyResponse = {
	itemIndex: number; item: StudyItem; answer: string; blankAnswers?: string[];
	status: "queued" | "evaluating" | "failed" | "done";
	feedback?: WrittenFeedback; outcome?: StudyOutcome; error?: string;
};

/** One provider request at a time; writing the next answer never waits for grading. */
export const useAnswerReview = (options: StudyEnvironment, session: {
	active: Accessor<boolean>; canWrite: Accessor<boolean>;
	current: Accessor<StudyItem | undefined>; itemIndex: Accessor<number | undefined>;
	pauseTimer: () => number; onSubmitted: () => void;
	prompt: (item: StudyItem, answer: string, locale: string, blankAnswers?: readonly string[]) => string;
	onResult: (itemIndex: number, outcome: StudyOutcome, details: StudySubmission & { feedback?: WrittenFeedback }) => void;
}) => {
	const [draft, setDraftValue] = createSignal("");
	const [responses, setResponses] = createSignal<StudyResponse[]>([]);
	const [evaluating, setEvaluating] = createSignal(false), [error, setError] = createSignal<string>();
	const pending = createMemo(() => responses().filter(value => value.status !== "done").length);
	const failed = createMemo(() => responses().some(value => value.status === "failed"));
	let abort: AbortController | undefined, revision = 0, disposed = false;
	const contexts = createEvaluationContextCache();
	let selection = { start: 0, end: 0 };
	const update = (itemIndex: number, patch: Partial<StudyResponse>) => setResponses(values => values.map(value => value.itemIndex === itemIndex ? { ...value, ...patch } : value));
	const cancel = () => { ++revision; abort?.abort(); abort = undefined; setEvaluating(false); };
	const reset = () => { cancel(); contexts.clear(); setDraftValue(""); selection = { start: 0, end: 0 }; setResponses([]); setError(undefined); };
	onCleanup(() => { disposed = true; cancel(); contexts.clear(); });
	const process = async () => {
		if (disposed || evaluating() || !session.active() || !options.canGenerate() || failed()) return;
		const value = responses().find(value => value.status === "queued");
		if (!value) return;
		const token = new AbortController(), requestRevision = revision, vaultId = options.vaultId();
		const valid = () => !disposed && !token.signal.aborted && revision === requestRevision && vaultId === options.vaultId() && session.active();
		abort = token; setEvaluating(true); update(value.itemIndex, { status: "evaluating" });
		try {
			if (!options.aiConnected()) throw Error("AI_DISCONNECTED");
			const context = contexts.get(options.notes(), value.item);
			const response = await options.requestText(session.prompt(value.item, value.answer, options.t("locale"), value.blankAnswers), token.signal, {
				items: [{ itemId: `review-${value.itemIndex}`, noteId: context.noteId, sourceIds: context.sourceIds, supportingNoteIds: context.supportingNoteIds }],
			}, "study-evaluation");
			if (!valid()) return;
			if (!contexts.unchanged(context, options.notes(), value.item)) throw Error("STUDY_SOURCES_CHANGED");
			const feedback = parseGeneratedFeedback(response, context.references, value.item.blanks?.length), outcome = feedback.correct ? "correct" : "wrong";
			// Apply the captured question's score before publishing a drained queue.
			batch(() => {
				session.onResult(value.itemIndex, outcome, { answer: value.answer, blankAnswers: value.blankAnswers, feedback });
				update(value.itemIndex, { status: "done", feedback, outcome });
			});
		} catch (failure) {
			if (!valid()) return;
			const code = failure instanceof Error ? failure.message : String(failure);
			const message = code === "STUDY_SOURCE_MISSING" ? options.t("studyWrittenMissingSource") : code === "STUDY_SOURCES_CHANGED" ? options.t("studyWrittenSourcesChanged")
				: code === "STUDY_INVALID_RESPONSE" || failure instanceof SyntaxError ? options.t("studyInvalidResponse") : options.describeAiError(failure);
			update(value.itemIndex, { status: "failed", error: message });
		} finally {
			if (abort === token) {
				abort = undefined; setEvaluating(false);
				if (valid()) void process();
			}
		}
	};
	createEffect(on(() => options.canGenerate() && session.active(), ready => { if (ready) void process(); }));
	const submission = (provided?: string | StudySubmission): StudySubmission => {
		const value = typeof provided === "object" ? provided : { answer: provided ?? draft() };
		return { answer: value.answer, blankAnswers: value.blankAnswers ? [...value.blankAnswers] : undefined };
	};
	const submit = (provided?: string | StudySubmission) => {
		const details = submission(provided), { answer, blankAnswers } = details;
		const item = session.current(), itemIndex = session.itemIndex();
		if (!item || itemIndex === undefined || !session.canWrite() || !answer.trim() || responses().some(value => value.itemIndex === itemIndex)) return;
		if (!options.aiConnected()) { setError(options.t("studyConnectFirst")); return; }
		const prompt = session.prompt(item, answer, options.t("locale"), blankAnswers);
		if (answer.length > 4000 || new TextEncoder().encode(prompt).length > 32_000) { setError(options.t("studyWrittenTooLong")); return; }
		if (session.pauseTimer() <= 0) return;
		setResponses(values => [...values, { itemIndex, item, ...details, status: "queued" }]);
		setDraftValue(""); selection = { start: 0, end: 0 }; setError(undefined); session.onSubmitted(); void process();
	};
	const completeUnanswered = (outcome: "timeout" | "skipped", provided?: string | StudySubmission) => {
		const details = submission(provided);
		const item = session.current(), itemIndex = session.itemIndex();
		if (!item || itemIndex === undefined || !session.canWrite() || responses().some(value => value.itemIndex === itemIndex)) return;
		batch(() => {
			session.onResult(itemIndex, outcome, details);
			setResponses(values => [...values, { itemIndex, item, ...details, status: "done", outcome }]);
			setDraftValue(""); selection = { start: 0, end: 0 }; setError(undefined); session.onSubmitted();
		});
	};
	const timeout = (provided?: string | StudySubmission) => completeUnanswered("timeout", provided);
	const skip = (provided?: string | StudySubmission) => {
		if (session.canWrite() && session.pauseTimer() > 0) completeUnanswered("skipped", provided);
	};
	return {
		draft, responses, evaluating, pending, failed, error, submit, timeout, skip, reset, cancel,
		selection: () => selection,
		setSelection: (start: number, end: number) => { if (session.canWrite()) selection = { start, end }; },
		retry: () => { setResponses(values => values.map(value => value.status === "failed" ? { ...value, status: "queued", error: undefined } : value)); void process(); },
		setDraft: (value: string) => { if (session.canWrite()) { setError(undefined); setDraftValue(value.slice(0, 4000)); } },
	};
};
