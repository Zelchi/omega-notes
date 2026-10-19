import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { StudyItemCountError, type StudyDeck, type StudyKind, type StudySummary, studySummary, recordStudyOutcome, recordFlashcardRating, flashcardInterval, type FlashcardRating, dueStudyIndices, incorrectStudyIndices, type StudyProgress, type StudyOutcome, type StudySubmission, type WrittenFeedback } from "@/entities/study";
import { createStudyPlan } from "./context";
import { generateStudyMaterial } from "./generation";
import type { StudyEnvironment } from "./environment";
import { useStudyLibrary, type StudyLibrary } from "./library";
import { useCorrection } from "./correction.controller";
import { useCloze } from "./cloze.controller";
import { useAnswerReview } from "./answer-review.controller";
import { writtenAnswerPrompt } from "./written-feedback";
import { clozeAnswerPrompt } from "./cloze-feedback";
import { readStudyPreferences, saveStudyPreferences } from "../api/preferences.repository";
import { useStudyRequestQueue } from "./request-queue";

type PendingProgress = { vaultId: string; deckId: string; kind: StudyKind; progress: StudyProgress };
type SavedStudy = StudyDeck | StudySummary;
const itemCount = (value: SavedStudy) => "items" in value ? value.items.length : value.itemCount;
type Stage = "setup" | "generating" | "running" | "grading" | "result" | "report";
const useStudySession = (options: StudyEnvironment, library: StudyLibrary, initialKind: StudyKind) => {
	const [open, setOpen] = createSignal(false), [kind, setKind] = createSignal<StudyKind>(initialKind);
	const [stage, setStage] = createSignal<Stage>("setup");
	const { decks, setDecks, loading: libraryLoading, storageFailed } = library;
	const [removing, setRemoving] = createSignal(false), [opening, setOpening] = createSignal(false);
	const [committing, setCommitting] = createSignal(false);
	const [generationSource, setGenerationSource] = createSignal<{ id: string; title: string }>();
	const loading = () => libraryLoading() || removing() || opening();
	const [scrollTop, setScrollTop] = createSignal(0);
	const [error, setError] = createSignal<string>(), [deck, setDeck] = createSignal<StudyDeck>();
	const preferences = readStudyPreferences(initialKind);
	const [count, setCount] = createSignal(preferences.count), [seconds, setSeconds] = createSignal(preferences.seconds), [lives, setLives] = createSignal(preferences.lives);
	const savePreferences = () => saveStudyPreferences(initialKind, { count: count(), seconds: seconds(), lives: lives() });
	const [index, setIndex] = createSignal(0), [revealed, setRevealed] = createSignal(false), [answered, setAnswered] = createSignal(false);
	const [choice, setChoice] = createSignal<number>(), [correct, setCorrect] = createSignal(0), [remainingLives, setRemainingLives] = createSignal(lives());
	const [remainingTime, setRemainingTime] = createSignal(seconds()), [endReason, setEndReason] = createSignal<"complete" | "lives">("complete");
	let deadline = 0, timer: ReturnType<typeof setInterval> | undefined, abort: AbortController | undefined;
	const [sessionIndices, setSessionIndices] = createSignal<number[]>([]);
	const [savingProgress, setSavingProgress] = createSignal(false), [progressFailed, setProgressFailed] = createSignal(false);
	const [clock, setClock] = createSignal(Date.now());
	let pendingProgress: PendingProgress | undefined;
	let progressSave: Promise<void> | undefined;
	const clockTimer = setInterval(() => { if (open()) setClock(Date.now()); }, 60_000);
	onCleanup(() => clearInterval(clockTimer));
	let revision = 0, disposed = false, pausedTime = seconds() * 1000;
	const stopTimer = () => { clearInterval(timer); timer = undefined; };
	const cancelGeneration = () => { abort?.abort(); abort = undefined; };
	const current = createMemo(() => deck()?.items[sessionIndices()[index()]]);
	const [outcome, setOutcome] = createSignal<StudyOutcome>();
	const advanceReviewed = () => {
		stopTimer();
		if (remainingLives() === 0 || index() + 1 >= sessionIndices().length) { setStage("grading"); return; }
		cloze.reset(); setIndex(value => value + 1); setAnswered(false); setOutcome(undefined); startTimer();
	};
	const review = useAnswerReview(options, {
		active: () => options.aiEnabled() && (stage() === "running" || stage() === "grading") && (deck()?.kind === "written" || deck()?.kind === "cloze"),
		canWrite: () => open() && stage() === "running" && (deck()?.kind === "written" || deck()?.kind === "cloze"),
		current, itemIndex: () => sessionIndices()[index()],
		prompt: (item, answer, locale, blankAnswers) => item.blanks ? clozeAnswerPrompt(item, answer, locale, blankAnswers) : writtenAnswerPrompt(item.question, item.answer, answer, locale),
		pauseTimer: () => {
			const remaining = Math.max(0, deadline - Date.now()); stopTimer();
			if (!remaining) { if (deck()?.kind === "cloze") cloze.timeout(); else review.timeout(); }
			return remaining;
		},
		onSubmitted: advanceReviewed,
		onResult: (itemIndex, result, details) => {
			if (result === "correct") setCorrect(previous => previous + 1);
			else setRemainingLives(previous => Math.max(0, previous - 1));
			record(result, itemIndex, details);
			if (remainingLives() === 0) { stopTimer(); setStage("grading"); }
		},
	});
	const cloze = useCloze({
		active: () => open() && stage() === "running" && deck()?.kind === "cloze",
		answered, blocked: () => savingProgress() || progressFailed(), current,
		onSubmit: answer => review.submit(answer), onTimeout: answer => review.timeout(answer), onSkip: answer => review.skip(answer),
	});
	const correction = useCorrection({
		active: () => open() && stage() === "running" && deck()?.kind === "correction",
		answered, blocked: () => progressBlocked(), current,
		expired: () => Date.now() >= deadline,
		onResult: result => commitOutcome(result),
	});
	createEffect(on(() => [open(), stage(), review.pending(), savingProgress(), progressFailed()] as const, ([isOpen, stage, pending, saving, failed]) => {
		if (isOpen && stage === "grading" && !pending && !saving && !failed) finish(remainingLives() === 0 ? "lives" : "complete");
	}));
	const close = () => {
		if (timer !== undefined) {
			pausedTime = Math.max(0, deadline - Date.now());
			setRemainingTime(Math.ceil(pausedTime / 1000));
		}
		stopTimer(); setOpen(false);
	};
	const resetSession = () => {
		close(); ++revision; cancelGeneration(); review.reset(); cloze.reset(); correction.reset();
		setCommitting(false); setGenerationSource(undefined);
		pendingProgress = undefined; progressSave = undefined; setRemoving(false); setOpening(false); setScrollTop(0); setProgressFailed(false); setSavingProgress(false); setError(undefined);
		setStage("setup"); setDeck(undefined); setSessionIndices([]); setIndex(0);
		setRevealed(false); setAnswered(false); setChoice(undefined); setOutcome(undefined); setCorrect(0);
		setRemainingLives(lives()); setEndReason("complete"); pausedTime = seconds() * 1000;
		setRemainingTime(seconds());
	};
	const contextNote = () => {
		if (stage() === "setup") return options.currentNote();
		const id = stage() === "generating" ? generationSource()?.id : deck()?.sourceNoteId;
		if (!id) return undefined;
		return options.notes().find(note => note.id === id) ?? { id, title: generationSource()?.id === id ? generationSource()!.title : options.t("studyDeletedSource") };
	};
	const context = createMemo(() => options.currentNote());
	const contextId = createMemo(() => options.currentNote()?.id);
	const saved = createMemo(() => decks().filter(deck => deck.kind === kind() && (!context() || deck.sourceNoteId === context()!.id)).sort((a, b) => b.createdAt - a.createdAt));
	createEffect(on(options.vaultId, resetSession));
	createEffect(on(contextId, close));
	createEffect(on(options.aiEnabled, enabled => { if (!enabled) resetSession(); }));
	onCleanup(() => { disposed = true; ++revision; cancelGeneration(); stopTimer(); });
	const finish = (reason: "complete" | "lives") => { stopTimer(); setEndReason(reason); setStage("result"); };
	const persistProgress = async () => {
		const requestRevision = revision;
		const pending = pendingProgress;
		if (!pending) return;
		setSavingProgress(true); setProgressFailed(false); setError(undefined);
		// Queue immediately: resetting a session must not discard a newer, unsaved snapshot.
		const request = library.saveProgress(pending.vaultId, pending.deckId, pending.kind, pending.progress);
		progressSave = request;
		try {
			await request;
			if (disposed || revision !== requestRevision || progressSave !== request) return;
			if (pendingProgress === pending) pendingProgress = undefined;
			setClock(Date.now());
		} catch {
			if (!disposed && revision === requestRevision && progressSave === request) { setProgressFailed(true); setError(options.t("studyProgressFailed")); }
		} finally {
			if (!disposed && revision === requestRevision && progressSave === request) { progressSave = undefined; setSavingProgress(false); }
		}
	};
	const record = (outcome: StudyOutcome, itemIndex = sessionIndices()[index()], details?: StudySubmission & { feedback?: WrittenFeedback }, rating?: FlashcardRating) => {
		const value = deck(), vaultId = options.vaultId();
		if (!value || !vaultId || itemIndex === undefined) return;
		const now = Date.now(), progress = rating ? recordFlashcardRating(value.progress, itemIndex, rating, now) : recordStudyOutcome(value.progress, itemIndex, outcome, now);
		if (details && (value.kind === "written" || value.kind === "cloze")) progress.responses = [...(progress.responses?.filter(entry => entry.itemIndex !== itemIndex) ?? []), { itemIndex, outcome, ...details, reviewedAt: now }].sort((a, b) => a.itemIndex - b.itemIndex);
		setDeck(previous => previous?.id === value.id ? { ...previous, progress } : previous);
		setDecks(previous => previous.map(deck => deck.id === value.id ? { ...deck, progress: { items: progress.items }, hasReport: !!progress.responses?.length } : deck));
		pendingProgress = { vaultId, deckId: value.id, kind: value.kind, progress };
		void persistProgress();
	};
	const dueCount = (value: SavedStudy) => dueStudyIndices(itemCount(value), value.progress, clock()).length;
	const errorCount = (value: SavedStudy) => incorrectStudyIndices(value.progress).length;
	const progressBlocked = () => savingProgress() || progressFailed() || review.evaluating();
	const commitOutcome = (value: StudyOutcome) => {
		if (!open() || stage() !== "running" || answered()) return;
		stopTimer(); setOutcome(value); setAnswered(true);
		if (value === "correct") setCorrect(previous => previous + 1);
		else setRemainingLives(previous => Math.max(0, previous - 1));
		record(value);
	};
	const answer = (selected?: number) => {
		if (progressBlocked() || stage() !== "running" || answered() || !current() || deck()?.kind !== "quiz") return;
		if (selected !== undefined && Date.now() >= deadline) selected = undefined;
		setChoice(selected);
		commitOutcome(selected === undefined ? "timeout" : selected === current()!.correctIndex ? "correct" : "wrong");
	};
	const startTimer = (milliseconds = seconds() * 1000) => {
		stopTimer(); pausedTime = milliseconds; setRemainingTime(Math.ceil(milliseconds / 1000));
		if (!open()) return;
		deadline = Date.now() + milliseconds;
		timer = setInterval(() => {
			if (!open() || stage() !== "running" || answered() || (deck()?.kind !== "written" && deck()?.kind !== "cloze" && progressBlocked())) return;
			const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemainingTime(left);
			if (left === 0) { if (deck()?.kind === "written") review.timeout(); else if (deck()?.kind === "cloze") cloze.timeout(); else if (deck()?.kind === "correction") commitOutcome("timeout"); else answer(); }
		}, 100);
	};
	const loadSession = async (value: SavedStudy): Promise<StudyDeck | undefined> => {
		if ("items" in value) return value;
		const vaultId = options.vaultId(), requestRevision = revision;
		if (!vaultId) return;
		setOpening(true); setError(undefined);
		try {
			const loaded = await library.read(vaultId, value.id, value.kind);
			if (disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
			setDecks(previous => previous.map(summary => summary.id === loaded.id ? studySummary(loaded) : summary));
			return loaded;
		} catch {
			if (!disposed && requestRevision === revision) setError(options.t("studyStorageFailed"));
		} finally { if (!disposed && requestRevision === revision) setOpening(false); }
	};
	const start = async (saved: SavedStudy, mode: "all" | "due" | "errors" = "all") => {
		if (!options.aiEnabled() || progressBlocked() || loading() || storageFailed()) return;
		const requestRevision = revision, vaultId = options.vaultId();
		const value = await loadSession(saved);
		if (!value || disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
		const indices = mode === "due" ? dueStudyIndices(value.items.length, value.progress, Date.now()) :
			mode === "errors" ? incorrectStudyIndices(value.progress) : value.items.map((_, index) => index);
		if (!indices.length) return;
		setSessionIndices(indices); setError(undefined); setScrollTop(0);
		review.reset(); cloze.reset(); correction.reset(); setOutcome(undefined);
		stopTimer(); setDeck(value); setIndex(0); setCorrect(0); setRevealed(false); setAnswered(false); setChoice(undefined);
		setRemainingLives(lives()); setEndReason("complete"); setStage("running");
		if (value.kind !== "flashcards") startTimer();
	};
	const next = () => {
		if (progressBlocked() || stage() !== "running") return;
		if (!answered()) return;
		if (remainingLives() === 0 && deck()?.kind !== "flashcards") { finish("lives"); return; }
		if (index() + 1 >= sessionIndices().length) { finish("complete"); return; }
		review.reset(); cloze.reset(); correction.reset(); setOutcome(undefined); setError(undefined);
		setIndex(value => value + 1); setRevealed(false); setAnswered(false); setChoice(undefined);
		if (deck()?.kind !== "flashcards") startTimer();
	};
	const generate = async () => {
		const vaultId = options.vaultId();
		if (progressBlocked() || !vaultId || !options.canGenerate() || loading() || storageFailed() || stage() === "generating") return;
		if (decks().length + library.invalidSessions().length >= 50) { setError(options.t("studyLimitReached")); return; }
		const source = options.currentNote();
		const plan = createStudyPlan(options.notes(), source, count());
		if (!plan.length) { setError(options.t("studyNoContent")); return; }
		const token = new AbortController(); abort = token;
		const requestRevision = revision, requestedKind = kind();
		setGenerationSource(source ? { id: source.id, title: source.title } : undefined);
		setError(undefined); setStage("generating");
		try {
			const parsed = await generateStudyMaterial(options, {
				plan, kind: requestedKind, focused: !!source, signal: token.signal,
				active: () => !disposed && requestRevision === revision && vaultId === options.vaultId(),
			});
			if (disposed || token.signal.aborted || requestRevision !== revision || vaultId !== options.vaultId()) return;
			const value: StudyDeck = { ...parsed, id: crypto.randomUUID(), kind: requestedKind, createdAt: Date.now(), sourceNoteId: source?.id };
			// Once the atomic save starts, Home/Cancel waits for it instead of confirming a late cancellation.
			setCommitting(true);
			if (!(await library.save(vaultId, value, token.signal))) return;
			if (disposed || vaultId !== options.vaultId() || requestRevision !== revision || token.signal.aborted) return;
			setDecks(previous => [studySummary(value), ...previous.filter(summary => summary.id !== value.id)]);
			if (requestRevision === revision && !token.signal.aborted) void start(value);
		} catch (failure) {
			if (disposed || token.signal.aborted || requestRevision !== revision || vaultId !== options.vaultId()) return;
			const code = failure instanceof Error ? failure.message : String(failure);
			setError(failure instanceof StudyItemCountError ? options.t("studyItemCountMismatch").replace("{expected}", String(failure.expected)).replace("{received}", String(failure.received))
				: code === "STUDY_INSUFFICIENT_CONTENT" ? options.t("studyInsufficientContent")
				: code === "STUDY_LIMIT_REACHED" ? options.t("studyLimitReached") : code === "STUDY_STORAGE_FAILED" ? options.t("studyStorageFailed") : code === "STUDY_INVALID_RESPONSE" || failure instanceof SyntaxError
				? options.t("studyInvalidResponse") : options.describeAiError(failure));
			setStage("setup");
		} finally { if (abort === token) { abort = undefined; setCommitting(false); } }
	};
	return {
		open, review, cloze, correction, outcome, contextNote, kind, stage, deck, current, saved, count, seconds, lives, loading, storageFailed, error: () => error() ?? library.error(),
		index, revealed, answered, choice, correct, remainingLives, remainingTime, endReason, scrollTop, setScrollTop,
		close, generate, start, answer, next, sessionIndices, dueCount, errorCount, savingProgress, progressFailed,
		flushSave: library.flushSave,
		invalidSessions: () => library.invalidSessions().filter(session => session.kind === kind()),
		accuracy: (value: SavedStudy) => {
			const items = value.progress?.items ?? [];
			return items.length ? Math.round(100 * items.filter(item => value.kind === "flashcards" && item.lastRating !== undefined ? item.lastRating === "easy" : item.lastOutcome === "correct").length / items.length) : undefined;
		},
		viewReport: async (saved: SavedStudy) => {
			if (progressBlocked() || loading() || saved.kind !== "written" && saved.kind !== "cloze") return;
			const requestRevision = revision, vaultId = options.vaultId();
			const value = await loadSession(saved);
			if (!value?.progress?.responses?.length || disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
			stopTimer(); review.reset(); cloze.reset(); correction.reset(); setScrollTop(0); setDeck(value); setError(undefined); setStage("report");
		},
		retryProgress: persistProgress,
		clearProgress: async (value: SavedStudy) => {
			if (progressBlocked() || loading()) return;
			const vaultId = options.vaultId(); if (!vaultId) return;
			const progress: StudyProgress = { items: [] };
			setDecks(previous => previous.map(deck => deck.id === value.id ? { ...deck, progress: { items: [] }, hasReport: false } : deck));
			setDeck(previous => previous?.id === value.id ? { ...previous, progress } : previous);
			pendingProgress = { vaultId, deckId: value.id, kind: value.kind, progress };
			await persistProgress();
		},
		show: (value: StudyKind) => {
			if (!options.aiEnabled() || !options.vaultId()) return;
			close();
			if (!options.aiConnected()) { options.onConnect(); return; }
			setKind(value); setClock(Date.now()); setOpen(true);
			if (stage() === "running" && deck()?.kind !== "flashcards" && !answered()) startTimer(pausedTime);
		},
		canGoHome: () => stage() !== "setup" && !loading() && !committing() && !savingProgress() && !progressFailed(),
		setup: () => {
			if (loading() || committing() || savingProgress() || progressFailed()) return;
			++revision; cancelGeneration(); stopTimer(); review.reset(); cloze.reset(); correction.reset();
			setError(undefined); setScrollTop(0); setClock(Date.now()); setStage("setup");
			setDeck(undefined); setSessionIndices([]); setIndex(0); setRevealed(false); setAnswered(false);
			setChoice(undefined); setOutcome(undefined); setCorrect(0); setRemainingLives(lives());
			setEndReason("complete"); pausedTime = seconds() * 1000; setRemainingTime(seconds());
		},
		reveal: () => setRevealed(true),
		ratingInterval: (rating: FlashcardRating) => flashcardInterval(deck()?.progress, sessionIndices()[index()], rating),
		mark: (rating: FlashcardRating) => {
			if (progressBlocked() || stage() !== "running" || answered() || !revealed() || deck()?.kind !== "flashcards") return;
			setAnswered(true); record(rating === "easy" ? "correct" : "wrong", sessionIndices()[index()], undefined, rating);
			if (rating === "easy") setCorrect(value => value + 1);
		},
		setCount: (value: number) => { if (value === 5 || value === 10 || value === 20 || value === 30) { setCount(value); savePreferences(); } },
		setSeconds: (value: number) => { if (value === 30 || value === 60 || value === 300) { setSeconds(value); savePreferences(); } },
		setLives: (value: number) => { if (value === 1 || value === 3 || value === 5) { setLives(value); savePreferences(); } },
		retry: library.load,
		remove: async (id: string) => {
			const vaultId = options.vaultId(), requestRevision = revision;
			if (!vaultId || loading() || progressBlocked() || stage() === "generating") return;
			setRemoving(true);
			try { await library.remove(vaultId, id, kind()); if (!disposed && revision === requestRevision) setDecks(previous => previous.filter(deck => deck.id !== id)); }
			catch { if (!disposed && revision === requestRevision) setError(options.t("studyStorageFailed")); }
			finally { if (!disposed && revision === requestRevision) setRemoving(false); }
		},
		randomNote: () => {
			const candidates = options.notes().filter(note => note.id !== options.currentNote()?.id);
			if (!candidates.length) return;
			const chosen = candidates[Math.floor(Math.random() * candidates.length)];
			close(); void options.onOpenNote(chosen);
		},
		canRandom: () => options.notes().some(note => note.id !== options.currentNote()?.id),
	};
};
type StudySession = ReturnType<typeof useStudySession>;

/** Each method retains its own screen, answers, timer and AI queue while hidden. */
export const useStudies = (options: StudyEnvironment): StudiesController => {
	const library = useStudyLibrary(options);
	const requests = useStudyRequestQueue(options);
	const environment = (kind: StudyKind): StudyEnvironment => ({ ...options, requestText: requests.forStudy(kind) });
	const sessions = {
		flashcards: useStudySession(environment("flashcards"), library, "flashcards"),
		quiz: useStudySession(environment("quiz"), library, "quiz"),
		written: useStudySession(environment("written"), library, "written"),
		cloze: useStudySession(environment("cloze"), library, "cloze"),
		correction: useStudySession(environment("correction"), library, "correction"),
	};
	const [selected, setSelected] = createSignal<StudyKind>("flashcards");
	const current = () => sessions[selected()];
	// Explicit forwarding keeps callbacks stable and lets TypeScript check every method.
	const close = () => Object.values(sessions).forEach(session => session.close());
	return {
		activeRequestKind: requests.activeKind,
		get review() { return current().review; },
		get cloze() { return current().cloze; },
		get correction() { return current().correction; },
		open: () => Object.values(sessions).some(session => session.open()),
		kind: selected, close, flushSave: library.flushSave,
		show: value => {
			if (!options.aiEnabled() || !options.vaultId()) return;
			close(); setSelected(value); sessions[value].show(value);
		},
		outcome: () => current().outcome(),
		contextNote: () => current().contextNote(),
		stage: () => current().stage(),
		deck: () => current().deck(),
		current: () => current().current(),
		saved: () => current().saved(),
		invalidSessions: () => current().invalidSessions(),
		count: () => current().count(),
		seconds: () => current().seconds(),
		lives: () => current().lives(),
		loading: () => current().loading(),
		storageFailed: () => current().storageFailed(),
		error: () => current().error(),
		index: () => current().index(),
		revealed: () => current().revealed(),
		answered: () => current().answered(),
		choice: () => current().choice(),
		correct: () => current().correct(),
		remainingLives: () => current().remainingLives(),
		remainingTime: () => current().remainingTime(),
		endReason: () => current().endReason(),
		scrollTop: () => current().scrollTop(),
		setScrollTop: (...args) => current().setScrollTop(...args),
		generate: () => current().generate(),
		start: (...args) => current().start(...args),
		answer: (...args) => current().answer(...args),
		next: () => current().next(),
		sessionIndices: () => current().sessionIndices(),
		dueCount: value => current().dueCount(value),
		errorCount: value => current().errorCount(value),
		savingProgress: () => current().savingProgress(),
		progressFailed: () => current().progressFailed(),
		accuracy: value => current().accuracy(value),
		viewReport: value => current().viewReport(value),
		retryProgress: () => current().retryProgress(),
		clearProgress: value => current().clearProgress(value),
		canGoHome: () => current().canGoHome(),
		setup: () => current().setup(),
		reveal: () => current().reveal(),
		ratingInterval: rating => current().ratingInterval(rating),
		mark: rating => current().mark(rating),
		setCount: value => current().setCount(value),
		setSeconds: value => current().setSeconds(value),
		setLives: value => current().setLives(value),
		retry: library.load,
		remove: id => current().remove(id),
		randomNote: () => current().randomNote(),
		canRandom: () => current().canRandom(),
	};
};
export type StudiesController = StudySession & { activeRequestKind: () => StudyKind | undefined };
