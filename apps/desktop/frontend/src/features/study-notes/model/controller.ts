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
import { readStudyGenerationTimes, readStudyPreferences, saveStudyGenerationTime, saveStudyPreferences, type StudyLimit } from "../api/preferences.repository";
import { useStudyRequestQueue } from "./request-queue";

type SavedStudy = StudyDeck | StudySummary;
const itemCount = (value: SavedStudy) => "items" in value ? value.items.length : value.itemCount;
const shuffled = <T,>(items: T[]): T[] => {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index--) {
		const other = Math.floor(Math.random() * (index + 1));
		[result[index], result[other]] = [result[other], result[index]];
	}
	return result;
};
type Stage = "setup" | "generating" | "running" | "grading" | "result" | "report";
const useStudySession = (options: StudyEnvironment, library: StudyLibrary, initialKind: StudyKind) => {
	const [open, setOpen] = createSignal(false), [kind, setKind] = createSignal<StudyKind>(initialKind);
	const [stage, setStage] = createSignal<Stage>("setup");
	const { decks, setDecks, loading: libraryLoading, storageFailed, savingProgress, progressFailed } = library;
	const [removing, setRemoving] = createSignal(false), [opening, setOpening] = createSignal(false);
	const [committing, setCommitting] = createSignal(false);
	const [generationElapsed, setGenerationElapsed] = createSignal(0), [generationAverage, setGenerationAverage] = createSignal<number>();
	const [generationLoopEnabled, setGenerationLoopEnabled] = createSignal(false);
	let generationClock: ReturnType<typeof setInterval> | undefined, generationClockOwner: AbortController | undefined, generationClockStartedAt = 0;
	const loading = () => libraryLoading() || removing() || opening();
	const [scrollTop, setScrollTop] = createSignal(0);
	const [librarySearch, setLibrarySearch] = createSignal("");
	const [libraryPage, setLibraryPage] = createSignal(0);
	const [deleteVisibleId, setDeleteVisibleId] = createSignal<string>();
	const [error, setError] = createSignal<string>(), [deck, setDeck] = createSignal<StudyDeck>();
	const [sessionMaterials, setSessionMaterials] = createSignal<StudyDeck[]>([]);
	const preferences = readStudyPreferences(initialKind);
	const [count, setCount] = createSignal<StudyLimit>(preferences.count), [seconds, setSeconds] = createSignal<StudyLimit>(preferences.seconds), [lives, setLives] = createSignal<StudyLimit>(preferences.lives);
	const savePreferences = () => saveStudyPreferences(initialKind, { count: count(), seconds: seconds(), lives: lives() });
	const [index, setIndex] = createSignal(0), [revealed, setRevealed] = createSignal(false), [answered, setAnswered] = createSignal(false);
	const [choice, setChoice] = createSignal<number>(), [correct, setCorrect] = createSignal(0), [remainingLives, setRemainingLives] = createSignal<StudyLimit>(lives());
	const [remainingTime, setRemainingTime] = createSignal<StudyLimit>(seconds()), [endReason, setEndReason] = createSignal<"complete" | "lives" | "manual">("complete");
	let deadline = 0, timer: ReturnType<typeof setInterval> | undefined, abort: AbortController | undefined;
	const [sessionIndices, setSessionIndices] = createSignal<number[]>([]);
	const [clock, setClock] = createSignal(Date.now());
	const clockTimer = setInterval(() => setClock(Date.now()), 60_000);
	onCleanup(() => clearInterval(clockTimer));
	const millisecondsFor = (value: StudyLimit) => value === "infinite" ? Infinity : value * 1000;
	const remainingSeconds = (milliseconds: number): StudyLimit => milliseconds === Infinity ? "infinite" : Math.ceil(milliseconds / 1000);
	let revision = 0, disposed = false;
	const loseLife = () => setRemainingLives(previous => previous === "infinite" ? previous : Math.max(0, previous - 1));
	const stopTimer = () => { clearInterval(timer); timer = undefined; };
	const stopGenerationClock = (owner?: AbortController, reset = false) => {
		if (owner && owner !== generationClockOwner) return;
		if (!reset && generationClockOwner) setGenerationElapsed(performance.now() - generationClockStartedAt);
		clearInterval(generationClock); generationClock = undefined; generationClockOwner = undefined;
		generationClockStartedAt = 0;
		if (reset) { setGenerationElapsed(0); setGenerationAverage(undefined); }
	};
	const startGenerationClock = (owner: AbortController, startedAt: number, times: number[]) => {
		stopGenerationClock(undefined, true);
		generationClockOwner = owner;
		generationClockStartedAt = startedAt;
		setGenerationAverage(times.length ? times.reduce((sum, time) => sum + time, 0) / times.length : undefined);
		setGenerationElapsed(0);
		generationClock = setInterval(() => {
			if (generationClockOwner === owner) setGenerationElapsed(performance.now() - startedAt);
		}, 250);
	};
	const cancelGeneration = () => {
		const owner = abort;
		owner?.abort(); abort = undefined;
		stopGenerationClock(owner, true);
	};
	const current = createMemo(() => deck()?.items[sessionIndices()[index()]]);
	const [outcome, setOutcome] = createSignal<StudyOutcome>();
	const advanceReviewed = () => {
		stopTimer();
		if (remainingLives() === 0 || index() + 1 >= sessionIndices().length) { setStage("grading"); return; }
		cloze.reset(); setIndex(value => value + 1); setAnswered(false); setOutcome(undefined); startTimer();
	};
	const review = useAnswerReview(options, {
		active: () => options.aiEnabled() && (stage() === "running" || stage() === "grading") && (deck()?.kind === "written" || deck()?.kind === "cloze"),
		canWrite: () => stage() === "running" && (deck()?.kind === "written" || deck()?.kind === "cloze"),
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
			else loseLife();
			record(result, itemIndex, details);
			if (remainingLives() === 0) { stopTimer(); setStage("grading"); }
		},
	});
	const cloze = useCloze({
		active: () => stage() === "running" && deck()?.kind === "cloze",
		answered, blocked: () => savingProgress() || progressFailed(), current,
		onSubmit: answer => review.submit(answer), onTimeout: answer => review.timeout(answer), onSkip: answer => review.skip(answer),
	});
	const correction = useCorrection({
		active: () => stage() === "running" && deck()?.kind === "correction",
		answered, blocked: () => progressBlocked(), current,
		expired: () => Date.now() >= deadline,
		onResult: result => commitOutcome(result),
	});
	createEffect(on(() => [stage(), review.pending(), savingProgress(), progressFailed()] as const, ([currentStage, pending, saving, failed]) => {
		if (currentStage === "grading" && !pending && !saving && !failed) finish(remainingLives() === 0 ? "lives" : endReason() === "manual" ? "manual" : "complete");
	}));
	const close = () => { setOpen(false); };
	const resetSession = () => {
		close(); stopTimer(); ++revision; cancelGeneration(); review.reset(); cloze.reset(); correction.reset();
		setGenerationLoopEnabled(false);
		setCommitting(false);
		setRemoving(false); setOpening(false); setScrollTop(0); setLibrarySearch(""); setLibraryPage(0); setDeleteVisibleId(undefined); setError(undefined);
		setStage("setup"); setDeck(undefined); setSessionMaterials([]); setSessionIndices([]); setIndex(0);
		setRevealed(false); setAnswered(false); setChoice(undefined); setOutcome(undefined); setCorrect(0);
		setRemainingLives(lives()); setEndReason("complete");
		setRemainingTime(seconds());
	};
	const contextId = createMemo(() => options.currentNote()?.id);
	const saved = createMemo(() => decks().filter(deck => deck.kind === kind()).sort((a, b) => b.createdAt - a.createdAt));
	createEffect(on(options.vaultId, resetSession));
	createEffect(on(contextId, close));
	createEffect(on(options.aiEnabled, enabled => { if (!enabled) resetSession(); }));
	onCleanup(() => { disposed = true; ++revision; cancelGeneration(); stopTimer(); });
	const returnToSetup = () => {
		if (loading() || committing() || savingProgress() || progressFailed()) return;
		setGenerationLoopEnabled(false);
		++revision; cancelGeneration(); stopTimer(); review.reset(); cloze.reset(); correction.reset();
		setError(undefined); setScrollTop(0); setClock(Date.now()); setStage("setup");
		setDeck(undefined); setSessionMaterials([]); setSessionIndices([]); setIndex(0); setRevealed(false); setAnswered(false);
		setChoice(undefined); setOutcome(undefined); setCorrect(0); setRemainingLives(lives());
		setEndReason("complete"); setRemainingTime(seconds());
	};
	const finish = (reason: "complete" | "lives" | "manual") => {
		stopTimer();
		if (reason === "complete" && deck()?.kind === "quiz" && sessionIndices().length === 1) { returnToSetup(); return; }
		setEndReason(reason); setStage("result");
	};
	const endStudy = () => {
		if (stage() !== "running" || savingProgress() || progressFailed()) return;
		stopTimer();
		const reason = remainingLives() === 0 ? "lives" : "manual";
		setEndReason(reason);
		if (review.pending()) setStage("grading");
		else finish(reason);
	};
	const persistProgress = async (vaultId: string, deckId: string, kind: StudyKind, progress: StudyProgress) => {
		const requestRevision = revision;
		if (!progressFailed()) setError(undefined);
		try {
			await library.saveProgress(vaultId, deckId, kind, progress);
			if (!disposed && revision === requestRevision && vaultId === options.vaultId()) setClock(Date.now());
		} catch {
			// A biblioteca mantém a falha para sinalização, retry e flush.
		}
	};
	const record = (outcome: StudyOutcome, itemIndex = sessionIndices()[index()], details?: StudySubmission & { feedback?: WrittenFeedback }, rating?: FlashcardRating) => {
		const value = deck(), vaultId = options.vaultId();
		const material = itemIndex === undefined ? undefined : sessionMaterials()[itemIndex];
		if (!value || !material || !vaultId || itemIndex === undefined) return;
		const now = Date.now(), progress = rating ? recordFlashcardRating(value.progress, itemIndex, rating, now) : recordStudyOutcome(value.progress, itemIndex, outcome, now);
		if (details && (value.kind === "written" || value.kind === "cloze")) progress.responses = [...(progress.responses?.filter(entry => entry.itemIndex !== itemIndex) ?? []), { itemIndex, outcome, ...details, reviewedAt: now }].sort((a, b) => a.itemIndex - b.itemIndex);
		const materialProgress = rating ? recordFlashcardRating(material.progress, 0, rating, now) : recordStudyOutcome(material.progress, 0, outcome, now);
		if (details && (material.kind === "written" || material.kind === "cloze")) materialProgress.responses = [...(materialProgress.responses?.filter(entry => entry.itemIndex !== 0) ?? []), { itemIndex: 0, outcome, ...details, reviewedAt: now }];
		setDeck(previous => previous?.id === value.id ? { ...previous, progress } : previous);
		setSessionMaterials(previous => previous.map((entry, index) => index === itemIndex ? { ...entry, progress: materialProgress } : entry));
		setDecks(previous => previous.map(entry => entry.id === material.id ? { ...entry, progress: { items: materialProgress.items }, hasReport: !!materialProgress.responses?.length } : entry));
		void persistProgress(vaultId, material.id, material.kind, materialProgress);
	};
	const dueCount = (value: SavedStudy) => dueStudyIndices(itemCount(value), value.progress, clock()).length;
	const errorCount = (value: SavedStudy) => incorrectStudyIndices(value.progress).length;
	const methodErrorCount = () => saved().reduce((total, value) => total + errorCount(value), 0);
	const progressBlocked = () => savingProgress() || progressFailed() || review.evaluating();
	const commitOutcome = (value: StudyOutcome) => {
		if (stage() !== "running" || answered()) return;
		stopTimer(); setOutcome(value); setAnswered(true);
		if (value === "correct") setCorrect(previous => previous + 1);
		else loseLife();
		record(value);
	};
	const answer = (selected?: number) => {
		if (progressBlocked() || stage() !== "running" || answered() || !current() || deck()?.kind !== "quiz") return;
		if (selected !== undefined && Date.now() >= deadline) selected = undefined;
		setChoice(selected);
		commitOutcome(selected === undefined ? "timeout" : selected === current()!.correctIndex ? "correct" : "wrong");
	};
	const startTimer = (milliseconds = millisecondsFor(seconds())) => {
		stopTimer(); setRemainingTime(remainingSeconds(milliseconds));
		deadline = milliseconds === Infinity ? Infinity : Date.now() + milliseconds;
		if (milliseconds === Infinity) return;
		timer = setInterval(() => {
			if (stage() !== "running" || answered() || (deck()?.kind !== "written" && deck()?.kind !== "cloze" && progressBlocked())) return;
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
	const start = async (saved: SavedStudy, mode: "all" | "due" | "errors" = "all", materials?: StudyDeck[]) => {
		if (!options.aiEnabled() || progressBlocked() || loading() || storageFailed()) return;
		const requestRevision = revision, vaultId = options.vaultId();
		const value = await loadSession(saved);
		if (!value || disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
		const members = materials ?? (value.id === deck()?.id ? sessionMaterials() : [value]);
		if (members.length !== value.items.length) return;
		const indices = mode === "due" ? dueStudyIndices(value.items.length, value.progress, Date.now()) :
			mode === "errors" ? incorrectStudyIndices(value.progress) : value.items.map((_, index) => index);
		if (!indices.length) return;
		setSessionIndices(indices); setError(undefined); setScrollTop(0);
		review.reset(); cloze.reset(); correction.reset(); setOutcome(undefined);
		stopTimer(); setDeck(value); setSessionMaterials(members); setIndex(0); setCorrect(0); setRevealed(false); setAnswered(false); setChoice(undefined);
		setRemainingLives(lives()); setEndReason("complete"); setStage("running");
		if (value.kind !== "flashcards") startTimer();
	};
	const studyRandom = async () => {
		if (!options.aiEnabled() || progressBlocked() || loading() || storageFailed()) return;
		const vaultId = options.vaultId(), requestRevision = revision;
		if (!vaultId) return;
		const candidates = saved();
		if (!candidates.length) return;
		const previouslyMissed = shuffled(candidates.filter(value => errorCount(value) > 0));
		const otherItems = shuffled(candidates.filter(value => errorCount(value) === 0));
		const quantity = count();
		const selected = [...previouslyMissed, ...otherItems].slice(0, quantity === "infinite" ? undefined : quantity);
		setOpening(true); setError(undefined);
		try {
			const materials = await Promise.all(selected.map(value => library.read(vaultId, value.id, value.kind)));
			if (disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
			setDecks(previous => previous.map(summary => {
				const material = materials.find(value => value.id === summary.id);
				return material ? studySummary(material) : summary;
			}));
			const progressItems = materials.flatMap((material, index) => (material.progress?.items ?? []).map(item => ({ ...item, itemIndex: index })));
			const responses = materials.flatMap((material, index) => (material.progress?.responses ?? []).map(response => ({ ...response, itemIndex: index })));
			const value: StudyDeck = {
				id: crypto.randomUUID(), kind: initialKind, title: options.t("studySaved"), createdAt: Date.now(),
				sourceNoteId: options.currentNote()?.id,
				items: materials.flatMap(material => material.items),
				progress: { items: progressItems, responses: responses.length ? responses : undefined },
			};
			setOpening(false);
			void start(value, "all", materials);
		} catch {
			if (!disposed && requestRevision === revision) setError(options.t("studyStorageFailed"));
		} finally {
			if (!disposed && requestRevision === revision) setOpening(false);
		}
	};
	const reviewMethodErrors = async () => {
		if (!options.aiEnabled() || progressBlocked() || loading() || storageFailed()) return;
		const vaultId = options.vaultId(), requestRevision = revision;
		if (!vaultId) return;
		const candidates = saved().filter(value => errorCount(value) > 0);
		if (!candidates.length) return;
		setOpening(true); setError(undefined);
		try {
			const materials = await Promise.all(candidates.map(value => library.read(vaultId, value.id, value.kind)));
			if (disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
			const withErrors = materials.filter(value => errorCount(value) > 0);
			if (!withErrors.length) return;
			setDecks(previous => previous.map(summary => {
				const material = withErrors.find(value => value.id === summary.id);
				return material ? studySummary(material) : summary;
			}));
			const progressItems = withErrors.flatMap((material, index) => (material.progress?.items ?? []).map(item => ({ ...item, itemIndex: index })));
			const responses = withErrors.flatMap((material, index) => (material.progress?.responses ?? []).map(response => ({ ...response, itemIndex: index })));
			const value: StudyDeck = {
				id: crypto.randomUUID(), kind: initialKind, title: options.t("studySaved"), createdAt: Date.now(),
				sourceNoteId: options.currentNote()?.id,
				items: withErrors.flatMap(material => material.items),
				progress: { items: progressItems, responses: responses.length ? responses : undefined },
			};
			setOpening(false);
			void start(value, "errors", withErrors);
		} catch {
			if (!disposed && requestRevision === revision) setError(options.t("studyStorageFailed"));
		} finally {
			if (!disposed && requestRevision === revision) setOpening(false);
		}
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
		if (progressBlocked() || !vaultId || !options.canGenerate() || loading() || storageFailed() || stage() === "generating") {
			if (generationLoopEnabled()) setGenerationLoopEnabled(false);
			return;
		}
		if (decks().length + library.invalidItems().length >= 1000) { setError(options.t("studyLimitReached")); setGenerationLoopEnabled(false); return; }
		const plan = createStudyPlan(options.noteSummaries(), 1);
		if (!plan.length) { setError(options.t("studyNoContent")); setGenerationLoopEnabled(false); return; }
		const token = new AbortController(); abort = token;
		const requestRevision = revision, requestedKind = kind();
		const normalAiMode = options.normalAiMode();
		const generationTimes = readStudyGenerationTimes(requestedKind);
		if (normalAiMode) {
			setGenerationElapsed(0);
			setGenerationAverage(generationTimes.length ? generationTimes.reduce((sum, time) => sum + time, 0) / generationTimes.length : undefined);
		} else stopGenerationClock(undefined, true);
		setError(undefined); setScrollTop(0); setStage("generating");
		let continueAfterGeneration = false;
		const itemStartedAt = new Map<string, number>();
		const uniqueTitle = (raw: string) => {
			const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
			const used = new Set(decks().filter(value => value.kind === requestedKind).map(value => normalize(value.title)));
			if (!used.has(normalize(raw))) return raw;
			for (let suffix = 2; suffix < 100_000; suffix++) {
				const ending = ` #${suffix}`;
				const candidate = `${raw.slice(0, 200 - ending.length).trimEnd()}${ending}`;
				if (!used.has(normalize(candidate))) return candidate;
			}
			throw Error("STUDY_INVALID_RESPONSE");
		};
		try {
			const parsed = await generateStudyMaterial(options, {
				plan, kind: requestedKind, signal: token.signal,
				active: () => !disposed && requestRevision === revision && vaultId === options.vaultId(),
				onRequestStart: assignment => {
					if (itemStartedAt.has(assignment.itemId)) return;
					const startedAt = performance.now();
					itemStartedAt.set(assignment.itemId, startedAt);
					if (normalAiMode) startGenerationClock(token, startedAt, readStudyGenerationTimes(requestedKind));
				},
				onItem: async material => {
					const value: StudyDeck = {
						id: crypto.randomUUID(), kind: requestedKind, title: uniqueTitle(material.title), createdAt: Date.now(),
						sourceNoteId: material.assignment.noteId, items: [material.item],
					};
					setCommitting(true);
					const saved = await library.save(vaultId, value, token.signal);
					setCommitting(false);
					if (!saved) return;
					if (disposed || vaultId !== options.vaultId() || requestRevision !== revision || token.signal.aborted) throw Error("AI_CANCELLED");
					setDecks(previous => [studySummary(value), ...previous.filter(entry => entry.id !== value.id)]);
					const startedAt = itemStartedAt.get(material.assignment.itemId);
					if (normalAiMode && options.normalAiMode() && startedAt !== undefined) {
						saveStudyGenerationTime(requestedKind, performance.now() - startedAt);
						const times = readStudyGenerationTimes(requestedKind);
						setGenerationAverage(times.reduce((sum, time) => sum + time, 0) / times.length);
					}
				},
			});
			if (disposed || token.signal.aborted || requestRevision !== revision || vaultId !== options.vaultId()) return;
			if (parsed.length !== 1) throw Error("STUDY_STORAGE_FAILED");
			setCommitting(false);
			if (requestRevision === revision && !token.signal.aborted) {
				setStage("setup");
				continueAfterGeneration = generationLoopEnabled();
			}
		} catch (failure) {
			if (disposed || token.signal.aborted || requestRevision !== revision || vaultId !== options.vaultId()) return;
			setGenerationLoopEnabled(false);
			const code = failure instanceof Error ? failure.message : String(failure);
			setError(failure instanceof StudyItemCountError ? options.t("studyItemCountMismatch").replace("{expected}", String(failure.expected)).replace("{received}", String(failure.received))
				: code === "STUDY_INSUFFICIENT_CONTENT" ? options.t("studyInsufficientContent")
					: code === "STUDY_LIMIT_REACHED" ? options.t("studyLimitReached") : code === "STUDY_STORAGE_FAILED" ? options.t("studyStorageFailed") : code === "STUDY_INVALID_RESPONSE" || failure instanceof SyntaxError
						? options.t("studyInvalidResponse") : options.describeAiError(failure));
			setStage("setup");
		} finally {
			stopGenerationClock(token);
			if (abort === token) { abort = undefined; setCommitting(false); }
			if (continueAfterGeneration && generationLoopEnabled() && !disposed && requestRevision === revision) {
				queueMicrotask(() => { if (generationLoopEnabled() && stage() === "setup") void generate(); });
			}
		}
	};
	return {
		open, review, cloze, correction, outcome, kind, stage, deck, current, saved, count, seconds, lives, loading, storageFailed,
		generationElapsed, generationAverage, generationLoopEnabled, error: () => progressFailed() ? options.t("studyProgressFailed") : error() ?? library.error(),
		index, revealed, answered, choice, correct, remainingLives, remainingTime, endReason, scrollTop, setScrollTop,
		librarySearch, setLibrarySearch, libraryPage, setLibraryPage, deleteVisibleId, setDeleteVisibleId,
		close, generate, start, studyRandom, reviewMethodErrors, methodErrorCount, answer, next, endStudy, canEnd: () => stage() === "running" && !loading() && !savingProgress() && !progressFailed(), sessionIndices, dueCount, errorCount, savingProgress, progressFailed,
		flushSave: library.flushSave,
		invalidItems: () => library.invalidItems().filter(item => item.kind === kind()),
		accuracy: (value: SavedStudy) => {
			const items = value.progress?.items ?? [];
			return items.length ? Math.round(100 * items.filter(item => value.kind === "flashcards" && item.lastRating !== undefined ? item.lastRating === "easy" : item.lastOutcome === "correct").length / items.length) : undefined;
		},
		viewReport: async (saved: SavedStudy) => {
			if (progressBlocked() || loading() || saved.kind !== "written" && saved.kind !== "cloze") return;
			const requestRevision = revision, vaultId = options.vaultId();
			const value = await loadSession(saved);
			if (!value?.progress?.responses?.length || disposed || requestRevision !== revision || vaultId !== options.vaultId()) return;
			stopTimer(); review.reset(); cloze.reset(); correction.reset(); setScrollTop(0); setDeck(value); setSessionMaterials([value]); setError(undefined); setStage("report");
		},
		retryProgress: () => { const vaultId = options.vaultId(); return vaultId ? library.flushSave(vaultId) : Promise.resolve(false); },
		clearProgress: async (value: SavedStudy) => {
			if (progressBlocked() || loading()) return;
			const vaultId = options.vaultId(); if (!vaultId) return;
			const progress: StudyProgress = { items: [] };
			setDecks(previous => previous.map(deck => deck.id === value.id ? { ...deck, progress: { items: [] }, hasReport: false } : deck));
			setSessionMaterials(previous => previous.map(material => material.id === value.id ? { ...material, progress } : material));
			setDeck(previous => previous?.id === value.id ? { ...previous, progress } : previous);
			await persistProgress(vaultId, value.id, value.kind, progress);
		},
		show: (value: StudyKind) => {
			if (!options.aiEnabled() || !options.vaultId()) return;
			close();
			setKind(value); setClock(Date.now()); setOpen(true);
		},
		canGoHome: () => stage() !== "setup" && !loading() && !committing() && !savingProgress() && !progressFailed(),
		toggleGenerationLoop: () => { if (stage() === "generating") setGenerationLoopEnabled(value => !value); },
		setup: returnToSetup,
		reveal: () => setRevealed(true),
		ratingInterval: (rating: FlashcardRating) => flashcardInterval(deck()?.progress, sessionIndices()[index()], rating),
		mark: (rating: FlashcardRating) => {
			if (progressBlocked() || stage() !== "running" || answered() || !revealed() || deck()?.kind !== "flashcards") return;
			setAnswered(true); record(rating === "easy" ? "correct" : "wrong", sessionIndices()[index()], undefined, rating);
			if (rating === "easy") setCorrect(value => value + 1);
		},
		setCount: (value: StudyLimit) => { if (value === "infinite" || value === 5 || value === 10 || value === 20 || value === 30) { setCount(value); savePreferences(); } },
		setSeconds: (value: StudyLimit) => { if (value === "infinite" || value === 30 || value === 60 || value === 300) { setSeconds(value); savePreferences(); } },
		setLives: (value: StudyLimit) => { if (value === "infinite" || value === 1 || value === 3 || value === 5) { setLives(value); savePreferences(); } },
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
			const candidates = options.noteSummaries().filter(note => note.id !== options.currentNote()?.id);
			if (!candidates.length) return;
			const chosen = candidates[Math.floor(Math.random() * candidates.length)];
			close(); void options.onOpenNote(chosen);
		},
		canRandom: () => options.noteSummaries().some(note => note.id !== options.currentNote()?.id),
	};
};
type StudySession = ReturnType<typeof useStudySession>;

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
	const close = () => { Object.values(sessions).forEach(session => session.close()); };
	return {
		activeRequestKind: requests.activeKind,
		get review() { return current().review; },
		get cloze() { return current().cloze; },
		get correction() { return current().correction; },
		get librarySearch() { return current().librarySearch; },
		get setLibrarySearch() { return current().setLibrarySearch; },
		get libraryPage() { return current().libraryPage; },
		get setLibraryPage() { return current().setLibraryPage; },
		get deleteVisibleId() { return current().deleteVisibleId; },
		get setDeleteVisibleId() { return current().setDeleteVisibleId; },
		open: () => Object.values(sessions).some(session => session.open()),
		kind: selected, close, flushSave: library.flushSave,
		show: value => {
			if (!options.aiEnabled() || !options.vaultId()) return;
			close(); setSelected(value); sessions[value].show(value);
		},
		outcome: () => current().outcome(),
		stage: () => current().stage(),
		deck: () => current().deck(),
		current: () => current().current(),
		saved: () => current().saved(),
		invalidItems: () => current().invalidItems(),
		count: () => current().count(),
		seconds: () => current().seconds(),
		lives: () => current().lives(),
		loading: () => current().loading(),
		storageFailed: () => current().storageFailed(),
		generationElapsed: () => current().generationElapsed(),
		generationAverage: () => current().generationAverage(),
		generationLoopEnabled: () => current().generationLoopEnabled(),
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
		toggleGenerationLoop: () => current().toggleGenerationLoop(),
		start: (...args) => current().start(...args),
		studyRandom: () => current().studyRandom(),
		reviewMethodErrors: () => current().reviewMethodErrors(),
		methodErrorCount: () => current().methodErrorCount(),
		answer: (...args) => current().answer(...args),
		next: () => current().next(),
		endStudy: () => current().endStudy(),
		canEnd: () => current().canEnd(),
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
