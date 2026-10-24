import { createEffect, createMemo, createUniqueId, For, lazy, on, onCleanup, Show, Suspense, Switch, Match, type Component } from "solid-js";
import type { NoteSummary } from "@/entities/note";
import type { StudyKind } from "@/entities/study";
import type { TranslationKey } from "@/shared/lib/i18n";
import Button from "@/shared/ui/button";
import { displayNoteTitle } from "@/entities/note";
import Dropdown from "@/shared/ui/dropdown";
import Icon from "@/shared/ui/icon";
import Input from "@/shared/ui/input";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import { createPresence } from "@/shared/lib/presence";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { cx } from "@/shared/lib/classes";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css.ts";
import StudyRequestNotice from "@/features/gambiarra-terminal/ui/study-request-notice";
import type { CliStudyRequest } from "@/features/gambiarra-terminal/model/study-bridge";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";

const CorrectionExercise = lazy(() => import("./correction-exercise"));
const ClozeExercise = lazy(() => import("./cloze-exercise"));
const WrittenAnswer = lazy(() => import("./written-answer"));
const AnswerResults = lazy(() => import("./written-answer").then(module => ({ default: module.AnswerResults })));

const StudyDialog: Component<{
	study: StudiesController; notes: NoteSummary[]; referenceTitles: Record<string, string>;
	canGenerate: boolean; aiBusy: boolean; chatBusy: boolean; connected: boolean;
	normalAiMode: boolean;
	cliRequest?: CliStudyRequest; onOpenCli?: () => void;
	t: (key: TranslationKey) => string; onConnect: () => void; onOpenNote: (note: NoteSummary) => void;
}> = props => {
	const study = props.study, presence = createPresence(study.open, 210), headingId = createUniqueId();
	const methodTitle = (kind: StudyKind) => props.t(kind === "flashcards" ? "studyFlashcards" : kind === "written" ? "studyWrittenQuiz" : kind === "cloze" ? "studyCloze" : kind === "correction" ? "studyCorrection" : "studyQuiz");
	const quizContinueLabel = (): TranslationKey => study.sessionIndices().length === 1
		? "studyMenuLabel"
		: study.index() + 1 >= study.sessionIndices().length || study.remainingLives() === 0
			? "studyResults"
			: "studyNextShort";
	const busyMessage = () => {
		const kind = study.activeRequestKind();
		const source = kind ? methodTitle(kind) : props.chatBusy ? props.t("aiChat") : undefined;
		return source ? props.t("studyAiBusyFrom").replace("{source}", source) : props.t("studyAiBusy");
	};
	const heading = createMemo<string>(previous => {
		if (!study.open()) return previous ?? "";
		return methodTitle(study.kind());
	});
	const generatedAt = (timestamp: number) => new Intl.DateTimeFormat(props.t("locale"), { dateStyle: "medium", timeStyle: "medium" }).format(timestamp);
	const generationTimeText = () => {
		const average = study.generationAverage();
		if (!average) return "--:--";
		const totalSeconds = Math.max(0, Math.ceil((average - study.generationElapsed()) / 1000));
		const seconds = String(totalSeconds % 60).padStart(2, "0");
		const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
		const hours = Math.floor(totalSeconds / 3600);
		return hours ? `${String(hours).padStart(2, "0")}:${minutes}:${seconds}` : `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${seconds}`;
	};
	const generationPercent = () => {
		const average = study.generationAverage();
		return average ? Math.min(99, Math.floor(study.generationElapsed() / average * 100)) : undefined;
	};
	const generationRingSize = 228, generationSvgViewBoxSize = 56;
	const generationSvgScale = generationRingSize / generationSvgViewBoxSize;
	const generationRingCenter = 28 * generationSvgScale, generationRingRadius = 25 * generationSvgScale;
	const generationCircumference = 2 * Math.PI * generationRingRadius;
	const generationDashArray = () => {
		const percent = generationPercent();
		const progress = percent === undefined ? 0.32 : percent / 100;
		const dash = generationCircumference * progress;
		return `${dash} ${generationCircumference - dash}`;
	};
	const libraryPageSize = 8;
	const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const filteredSaved = createMemo(() => {
		const query = normalizeSearch(study.librarySearch().trim());
		return study.saved().filter(deck => !query || normalizeSearch(deck.title).includes(query));
	});
	const libraryPageCount = createMemo(() => Math.max(1, Math.ceil(filteredSaved().length / libraryPageSize)));
	const paginatedSaved = createMemo(() => filteredSaved().slice(study.libraryPage() * libraryPageSize, (study.libraryPage() + 1) * libraryPageSize));
	const centerSetupPage = () => study.stage() === "setup" && paginatedSaved().length === libraryPageSize;
	createEffect(() => {
		if (study.saved().length <= libraryPageSize && study.librarySearch()) { study.setLibrarySearch(""); study.setLibraryPage(0); }
	});
	createEffect(() => {
		const lastPage = Math.max(0, libraryPageCount() - 1);
		if (study.libraryPage() > lastPage) study.setLibraryPage(lastPage);
	});
	let closeButton!: HTMLButtonElement, viewport: HTMLDivElement | undefined;
	createEffect(on(() => [study.open(), study.kind(), study.stage()] as const, ([open]) => {
		if (!open) return;
		const top = study.scrollTop();
		const frame = requestAnimationFrame(() => { if (viewport) viewport.scrollTop = top; });
		onCleanup(() => cancelAnimationFrame(frame));
	}));
	const backdrop = createBackdropDismiss(study.close);
	createEffect(() => {
		if (!study.open()) return;
		const frame = requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault(); event.stopImmediatePropagation(); study.close();
		};
		window.addEventListener("keydown", escape, true);
		onCleanup(() => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape, true); });
	});
	const ResultActions: Component = () => <>
		<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={() => { const deck = study.deck(); if (deck) study.start(deck); }}>{props.t("studyRestart")}</Button>
		<Button class={styles.button} type="button" disabled={!study.methodErrorCount() || study.loading() || study.savingProgress() || study.progressFailed()} onClick={() => void study.reviewMethodErrors()}>{props.t("studyReviewDue")}</Button>
		<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={study.setup}>{props.t("studyBackToItems")}</Button>
	</>;
	return <Show when={presence.present()}>
		<div class={cx(styles.backdrop, study.kind() === "written" && study.stage() === "running" && styles.writtenBackdrop)} inert={presence.exiting()} aria-hidden={presence.exiting() || undefined} {...backdrop}
			ref={element => registerVisibilityAnimation(element, presence.exiting, "fade")}>
			<section class={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}
				ref={element => registerVisibilityAnimation(element, presence.exiting, "dialog")}>
				<AsciiBackdrop placement="modal" />
				<header class={styles.header}>
					<h2 class={styles.title} id={headingId}>{heading()}</h2>
					<div class={styles.headerActions}>
						<Button class={cx(styles.button, styles.icon)} type="button" aria-label={props.t("studyHome")} disabled={!study.canGoHome()} onClick={study.setup}><Icon name="reset" size={16} /></Button>
						<Button ref={closeButton} class={cx(styles.button, styles.icon)} type="button" aria-label={props.t("close")} onClick={study.close}><Icon name="close" size={16} /></Button>
					</div>
				</header>
				<div class={styles.content}>
					<CustomScrollArea centerContentVertically={centerSetupPage()} zeroVerticalPadding={centerSetupPage()} viewportStyle={study.stage() !== "setup" ? { "padding-top": "32px", "padding-bottom": "20px" } : undefined} viewportRef={element => { viewport = element; }} onScroll={element => { if (study.open()) study.setScrollTop(element.scrollTop); }}><div class={cx(styles.body, study.stage() === "setup" && styles.setupBody)}>
						<Show when={props.cliRequest}>{request => <StudyRequestNotice request={request()} t={props.t} onOpenCli={props.onOpenCli} />}</Show>
						<Show when={study.error()}><p class={styles.error} role="alert">{study.error()}</p></Show>
						<Show when={study.review.failed()}>
							<For each={study.review.responses().filter(value => value.status === "failed")}>{value => <p class={styles.error} role="alert">{value.error}</p>}</For>
							<Button class={styles.button} type="button" disabled={!props.canGenerate} onClick={study.review.retry}>{props.t("retry")}</Button>
						</Show>
						<Show when={study.progressFailed()}><Button class={styles.button} type="button" onClick={() => void study.retryProgress()}>{props.t("retry")}</Button></Show>
						<Switch>
							<Match when={study.stage() === "setup"}>
								<div class={styles.settings}>
									<div class={styles.label}><span>{props.t("studyCount")}</span>
										<Dropdown ariaLabel={props.t("studyCount")} value={String(study.count())} options={[
											{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "20", label: "20" }, { value: "30", label: "30" },
											{ value: "infinite", label: props.t("studyInfinite") },
										]} onChange={value => study.setCount(value === "infinite" ? value : Number(value))} />
									</div>
									<Show when={study.kind() !== "flashcards"}>
										<div class={styles.label}><span>{props.t("studyLives")}</span>
											<Dropdown ariaLabel={props.t("studyLives")} value={String(study.lives())} options={[
												{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "5", label: "5" },
												{ value: "infinite", label: props.t("studyInfinite") },
											]} onChange={value => study.setLives(value === "infinite" ? value : Number(value))} />
										</div>
										<div class={styles.label}><span>{props.t("studySeconds")}</span>
											<Dropdown ariaLabel={props.t("studySeconds")} value={String(study.seconds())} options={[
												{ value: "30", label: props.t("studyThirtySeconds") },
												{ value: "60", label: props.t("studyOneMinute") },
												{ value: "300", label: props.t("studyFiveMinutes") },
												{ value: "infinite", label: props.t("studyInfinite") },
											]} onChange={value => study.setSeconds(value === "infinite" ? value : Number(value))} />
										</div>
									</Show>
								</div>


								<Show when={!props.connected}><p class={styles.muted}>{props.t("studyConnectFirst")}</p><Button class={styles.button} type="button" onClick={() => { study.close(); props.onConnect(); }}>{props.t("aiConnect")}</Button></Show>
								<Show when={props.connected && props.aiBusy}><p class={styles.muted} role="status">{busyMessage()}</p></Show>
								<Show when={study.storageFailed()}><Button class={styles.button} type="button" onClick={() => void study.retry()}>{props.t("retry")}</Button></Show>
								<Show when={study.invalidItems().length}>
									<p class={styles.error} role="alert">{props.t("studyInvalidItems")}</p>
									<Button class={styles.button} type="button" disabled={study.loading()} onClick={() => void study.retry()}>{props.t("retry")}</Button>
									<For each={study.invalidItems()}>{item => <div class={styles.itemRow}>
										<span class={styles.muted}>{item.kind}/{item.id}.json</span>
										<Button class={cx(styles.button, styles.icon, styles.danger)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} aria-label={props.t("delete")} onClick={() => void study.remove(item.id)}><Icon name="delete" size={15} /></Button>
									</div>}</For>
								</Show>
								<Show when={study.saved().length}><div class={cx(styles.library, study.saved().length > libraryPageSize && styles.libraryWithSearch)} role="region" aria-label={props.t("studySaved")}>
									<Show when={study.saved().length > libraryPageSize}>
										<div class={styles.librarySearchSticky}>
											<Input class={styles.librarySearch} type="search" value={study.librarySearch()} onInput={event => { study.setLibrarySearch(event.currentTarget.value); study.setLibraryPage(0); }} placeholder={props.t("searchPlaceholder")} aria-label={props.t("searchPlaceholder")} />
										</div>
									</Show>
									<Show when={paginatedSaved().length} fallback={study.librarySearch().trim() ? <p class={styles.noSearchResults}>{props.t("studyNoSearchResults")}</p> : null}>
										<For each={paginatedSaved()}>{deck => {
											const outcome = deck.progress?.items[0]?.lastOutcome;
											const outcomeClass = outcome === undefined ? undefined : outcome === "correct" ? styles.correct : styles.wrong;
											const actionsVisible = () => study.deleteVisibleId() === deck.id;
											return <div class={styles.libraryEntry} onContextMenu={event => {
												event.preventDefault(); event.stopPropagation();
												study.setDeleteVisibleId(current => current === deck.id ? undefined : deck.id);
											}}>
												<div class={styles.libraryItemRow}>
													<Button class={cx(styles.button, styles.icon, styles.actionReveal, styles.actionRevealLeading, actionsVisible() && styles.actionRevealVisible, actionsVisible() && styles.actionRevealLeadingVisible)} type="button" disabled={!actionsVisible() || !deck.progress?.items.length || study.loading() || study.savingProgress() || study.progressFailed()} aria-hidden={!actionsVisible()} tabIndex={actionsVisible() ? 0 : -1} aria-label={props.t("studyClearProgress")} onClick={() => { study.setDeleteVisibleId(undefined); void study.clearProgress(deck); }}><Icon name="reset" size={16} /></Button>
													<Button class={cx(styles.button, styles.itemTitle, outcomeClass)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} onClick={() => { study.setDeleteVisibleId(undefined); void study.start(deck); }}><span>{deck.title}</span></Button>
													<Show when={deck.kind === "written" || deck.kind === "cloze"}>
														<div class={styles.reportSlot}>
															<Show when={deck.hasReport}>
																<Button class={cx(styles.button, styles.icon)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} aria-label={props.t("studyOpenReport")} onClick={() => study.viewReport(deck)}><Icon name="view" size={16} /></Button>
															</Show>
														</div>
													</Show>
													<Button class={cx(styles.button, styles.icon, styles.danger, styles.actionReveal, styles.actionRevealTrailing, actionsVisible() && styles.actionRevealVisible, actionsVisible() && styles.actionRevealTrailingVisible)} type="button" disabled={!actionsVisible() || study.loading() || study.savingProgress() || study.progressFailed()} aria-hidden={!actionsVisible()} tabIndex={actionsVisible() ? 0 : -1} aria-label={props.t("delete")} onClick={() => { study.setDeleteVisibleId(undefined); void study.remove(deck.id); }}><Icon name="delete" size={15} /></Button>
												</div>
											</div>;
										}}</For>
									</Show>
									<Show when={filteredSaved().length > libraryPageSize}>
										<nav class={styles.libraryPagination} aria-label={props.t("studyPagination")}>
											<Button class={cx(styles.button, styles.icon)} type="button" aria-label={props.t("studyPreviousPage")} disabled={study.libraryPage() === 0} onClick={() => study.setLibraryPage(page => Math.max(0, page - 1))}><Icon name="back" size={16} /></Button>
											<span class={styles.libraryPageLabel}>{props.t("studyPageIndicator").replace("{current}", String(study.libraryPage() + 1)).replace("{total}", String(libraryPageCount()))}</span>
											<Button class={cx(styles.button, styles.icon, styles.libraryNextButton)} type="button" aria-label={props.t("studyNextPage")} disabled={study.libraryPage() + 1 >= libraryPageCount()} onClick={() => study.setLibraryPage(page => Math.min(libraryPageCount() - 1, page + 1))}><span class={styles.libraryNextIcon}><Icon name="back" size={16} /></span></Button>
										</nav>
									</Show>
								</div></Show>
							</Match>
							<Match when={study.stage() === "generating"}>
								<Show when={props.normalAiMode}>
									<div class={styles.generationRingCenter}>
										<svg class={cx(styles.generationRing, generationPercent() === undefined && styles.generationRingIndeterminate)} viewBox={`0 0 ${generationRingSize} ${generationRingSize}`}
											role="progressbar" aria-label={props.t("studyGenerating")} aria-valuemin="0" aria-valuemax="100"
											aria-valuenow={generationPercent()} aria-valuetext={generationPercent() === undefined ? props.t("studyGenerationFirst") : props.t("studyGenerationProgress").replace("{percent}", String(generationPercent()))}>
											<circle class={styles.generationRingTrack} cx={generationRingCenter} cy={generationRingCenter} r={generationRingRadius} />
											<circle class={styles.generationRingProgress} cx={generationRingCenter} cy={generationRingCenter} r={generationRingRadius} transform={`rotate(-90 ${generationRingCenter} ${generationRingCenter})`}
												stroke-dasharray={generationDashArray()} />
											<circle class={styles.generationRingEdge} cx={generationRingCenter} cy={generationRingCenter} r={26 * generationSvgScale} />
											<circle class={styles.generationRingEdge} cx={generationRingCenter} cy={generationRingCenter} r={24 * generationSvgScale} />
										</svg>
										<span class={styles.generationRingTime} aria-hidden="true">{generationTimeText()}</span>
									</div>
								</Show>
							</Match>
							<Match when={study.stage() === "running"}>
								<div class={styles.status} aria-live="polite"><span>{study.index() + 1} / {study.sessionIndices().length}</span>
									<Show when={study.deck()?.kind !== "flashcards"}><span>{props.t("studyLives")}: {study.remainingLives() === "infinite" ? props.t("studyInfinite") : study.remainingLives()} · {study.remainingTime() === "infinite" ? props.t("studyInfinite") : `${study.remainingTime()}s`}</span></Show>
								</div>
								<Show when={study.current()}>{item => <>
									<Show when={study.deck()?.kind === "correction"}><Suspense fallback={null}><CorrectionExercise study={study} t={props.t} /></Suspense></Show>
									<Show when={study.deck()?.kind !== "correction"}>
										<Show when={study.deck()?.kind !== "cloze"} fallback={<Suspense fallback={null}><ClozeExercise study={study} t={props.t} /></Suspense>}>
											<div class={styles.card}><h3 class={styles.question}>{item().question}</h3>
												<Show when={study.deck()?.kind === "flashcards" && study.revealed()}><div class={styles.answer}>{item().answer}</div></Show>
											</div>
										</Show>
									</Show>
									<Show when={study.deck()?.kind === "written"} fallback={<>
										<Show when={study.deck()?.kind === "quiz"}>
											<div class={styles.choices}><For each={item().options}>{(option, index) => <Button type="button"
												class={cx(styles.button, styles.choice, study.answered() && study.choice() === index() && (item().correctIndex === index() ? styles.correct : styles.wrong))}
												disabled={study.answered() || study.savingProgress() || study.progressFailed()} onClick={() => study.answer(index())}>{String.fromCharCode(65 + index())}. {option}</Button>}</For></div>
											<Show when={study.answered()}>
												<p class={styles.muted} role="status">{props.t(study.choice() === undefined ? "studyTimeout" : study.choice() === item().correctIndex ? "studyCorrect" : "studyWrong")} {item().explanation}</p>
											</Show>
										</Show>
									</>}>
										<Suspense fallback={null}><WrittenAnswer study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote} /></Suspense>
									</Show>
									<Show when={study.revealed() || study.answered()}><div class={styles.actions}>
										<span class={styles.muted}>{props.t("studySources")}</span>
										<For each={item().sources}>{id => {
											const source = () => props.notes.find(note => note.id === id);
											return <Button class={styles.link} type="button" disabled={!source()} onClick={() => { const note = source(); if (note) { study.close(); props.onOpenNote(note); } }}>{source() ? displayNoteTitle(source()!) : props.referenceTitles[id] ?? props.t("studyDeletedSource")}</Button>;
										}}</For>
									</div></Show>
								</>}</Show>
							</Match>
							<Match when={study.stage() === "grading"}>
								<p class={styles.muted} role="status">{props.t("studyWrittenWaiting").replace("{count}", String(study.review.pending()))}</p>
							</Match>
							<Match when={study.stage() === "report"}>
								<Show when={study.deck()}>{deck => <>
									<h3 class={styles.question}>{props.t("studyReport")}</h3>
									<p class={styles.muted}>{generatedAt(deck().createdAt)} · {props.t("studyAccuracy")}: {study.accuracy(deck()) ?? 0}%</p>
									<Suspense fallback={null}><AnswerResults study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote}
										responses={(deck().progress?.responses ?? []).map(entry => ({ ...entry, status: "done" as const, item: deck().items[entry.itemIndex] }))} /></Suspense>
								</>}</Show>
							</Match>
							<Match when={study.stage() === "result"}>
								<h3 class={styles.question}>{props.t("studyResults")}</h3>
								<p class={styles.muted}>{props.t("studyScore")}: {study.correct()} / {study.sessionIndices().length ?? 0}</p>
								<Show when={study.endReason() === "lives"}><p class={styles.muted}>{props.t("studyNoLives")}</p></Show>
								<Show when={study.deck()?.kind === "written" || study.deck()?.kind === "cloze"}><Suspense fallback={null}><AnswerResults study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote} /></Suspense></Show>
							</Match>
						</Switch>
					</div></CustomScrollArea></div>
				<Show when={study.stage() === "running" && study.deck()?.kind === "quiz"}>
					<footer class={styles.footer}>
						<div class={styles.practiceNavigation}>
							<Button class={styles.button} type="button" disabled={!study.canEnd()} onClick={study.endStudy}>{props.t("studyEnd")}</Button>
							<Button class={styles.button} type="button" disabled={!study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(quizContinueLabel())}</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "result"}>
					<footer class={styles.footer}><div class={styles.resultActions}><ResultActions /></div></footer>
				</Show>
				<Show when={study.stage() === "setup"}>
					<footer class={styles.footer}>
						<div class={styles.setupActions}>
							<Button class={styles.button} type="button" disabled={!props.canGenerate || study.loading() || study.storageFailed() || study.savingProgress() || study.progressFailed()} onClick={() => void study.generate()}>{props.t("studyGenerate")}</Button>
							<Button class={styles.button} type="button" disabled={!study.methodErrorCount() || study.loading() || study.storageFailed() || study.savingProgress() || study.progressFailed()} onClick={() => void study.reviewMethodErrors()}>{props.t("studyReviewDue")}</Button>
							<Button class={styles.button} type="button" disabled={!study.saved().length || study.loading() || study.storageFailed() || study.savingProgress() || study.progressFailed()} onClick={() => void study.studyRandom()}>{props.t("studyStudy")}</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "generating"}>
					<footer class={styles.footer}>
						<div class={styles.generationActions}>
							<Button class={styles.button} type="button" disabled={!study.canGoHome()} onClick={study.setup}>{props.t("cancel")}</Button>
							<Button class={cx(styles.button, study.generationLoopEnabled() && styles.generationLoopActive)} type="button" role="switch"
								aria-checked={study.generationLoopEnabled()} onClick={study.toggleGenerationLoop}>
								{props.t(study.generationLoopEnabled() ? "studyContinuing" : "studyContinue")}
							</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "grading"}>
					<footer class={styles.footer}>
						<div class={styles.gradingActions}>
							<Show when={study.review.failed()}><Button class={styles.button} type="button" disabled={!props.canGenerate} onClick={study.review.retry}>{props.t("retry")}</Button></Show>
							<Show when={study.progressFailed()}><Button class={styles.button} type="button" onClick={() => void study.retryProgress()}>{props.t("retry")}</Button></Show>
							<Button class={styles.button} type="button" onClick={study.close}>{props.t("close")}</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "written" && !study.answered()}>
					<footer class={styles.footer}>
						<div class={styles.practiceNavigation}>
							<Button class={styles.button} type="button" disabled={!study.canEnd()} onClick={study.endStudy}>{props.t("studyEnd")}</Button>
							<Button class={styles.button} type="button" disabled={!props.connected || !study.review.draft().trim()} onClick={() => void study.review.submit()}>{props.t("studyWrittenSubmit")}</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "flashcards"}>
					<footer class={cx(styles.footer, styles.flashcardFooter)}>
						<div class={styles.ratings}>
							<For each={["easy", "medium", "hard"] as const}>{rating => <Button class={styles.button} type="button" disabled={!study.revealed() || study.answered() || study.savingProgress() || study.progressFailed()} onClick={() => study.mark(rating)}>
								{props.t(rating === "easy" ? "studyEasy" : rating === "medium" ? "studyMedium" : "studyHard")}
								<span class={styles.ratingInterval}>{study.ratingInterval(rating) < 86_400_000 ? props.t("studyReviewMinutes").replace("{count}", String(study.ratingInterval(rating) / 60_000)) : props.t("studyReviewDays").replace("{count}", String(study.ratingInterval(rating) / 86_400_000))}</span>
							</Button>}</For>
						</div>
						<div class={styles.flashcardActions}>
							<Button class={styles.button} type="button" disabled={study.revealed() || study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.reveal}>{props.t("studyReveal")}</Button>
							<div class={styles.practiceNavigation}>
								<Button class={styles.button} type="button" disabled={!study.canEnd()} onClick={study.endStudy}>{props.t("studyEnd")}</Button>
								<Button class={styles.button} type="button" disabled={!study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(study.index() + 1 >= study.sessionIndices().length ? "studyResults" : "studyNext")}</Button>
							</div>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "cloze"}>
					<footer class={styles.footer}><div class={styles.clozeActions}>
						<Button class={styles.button} type="button" disabled={!study.canEnd()} onClick={study.endStudy}>{props.t("studyEnd")}</Button>
						<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={study.cloze.skip}>{props.t("studySkip")}</Button>
						<Button class={styles.button} type="button" disabled={!props.connected || !study.cloze.complete() || study.savingProgress() || study.progressFailed()} onClick={study.cloze.submit}>{props.t("studyWrittenSubmit")}</Button>
					</div></footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "correction"}>
					<footer class={styles.footer}><div class={styles.practiceActions}>
						<div class={styles.practiceNavigation}>
							<Button class={styles.button} type="button" disabled={study.answered() || !study.correction.selected().size || study.savingProgress() || study.progressFailed()} onClick={study.correction.submit}>{props.t("studyCorrectionCheck")}</Button>
							<Button class={styles.button} type="button" disabled={study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.correction.reveal}>{props.t("studyReveal")}</Button>
						</div>
						<div class={styles.practiceNavigation}>
							<Button class={styles.button} type="button" disabled={!study.canEnd()} onClick={study.endStudy}>{props.t("studyEnd")}</Button>
							<Button class={styles.button} type="button" disabled={!study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(study.index() + 1 >= study.sessionIndices().length || study.remainingLives() === 0 ? "studyResults" : "studyNext")}</Button>
						</div>
					</div></footer>
				</Show>
				<Show when={study.stage() === "report"}>
					<footer class={styles.footer}><Button class={styles.button} type="button" onClick={study.setup}>{props.t("studyBackToItems")}</Button></footer>
				</Show>
			</section>
		</div>
	</Show>;
};
export default StudyDialog;
