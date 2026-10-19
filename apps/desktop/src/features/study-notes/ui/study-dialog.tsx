import CorrectionExercise from "./correction-exercise";
import ClozeExercise from "./cloze-exercise";
import WrittenAnswer, { AnswerResults } from "./written-answer";
import { createEffect, createMemo, createUniqueId, For, on, onCleanup, Show, Switch, Match, type Component } from "solid-js";
import type { StudyNote } from "@/entities/note";
import type { StudyKind } from "@/entities/study";
import type { TranslationKey } from "@/shared/lib/i18n";
import Button from "@/shared/ui/button";
import Dropdown from "@/shared/ui/dropdown";
import Icon from "@/shared/ui/icon";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import { createPresence } from "@/shared/lib/presence";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { cx } from "@/shared/lib/classes";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css.ts";

const StudyDialog: Component<{
	study: StudiesController; notes: StudyNote[]; referenceTitles: Record<string, string>;
	canGenerate: boolean; aiBusy: boolean; chatBusy: boolean; connected: boolean;
	t: (key: TranslationKey) => string; onConnect: () => void; onOpenNote: (note: StudyNote) => void;
}> = props => {
	const study = props.study, presence = createPresence(study.open, 210), headingId = createUniqueId();
	const methodTitle = (kind: StudyKind) => props.t(kind === "flashcards" ? "studyFlashcards" : kind === "written" ? "studyWrittenQuiz" : kind === "cloze" ? "studyCloze" : kind === "correction" ? "studyCorrection" : "studyQuiz");
	const busyMessage = () => {
		const kind = study.activeRequestKind();
		const source = kind ? methodTitle(kind) : props.chatBusy ? props.t("aiChat") : undefined;
		return source ? props.t("studyAiBusyFrom").replace("{source}", source) : props.t("studyAiBusy");
	};
	const heading = createMemo<string>(previous => {
		if (!study.open()) return previous ?? "";
		const method = methodTitle(study.kind());
		return `${method} · ${study.contextNote()?.title ?? props.t("studyGeneral")}`;
	});
	const generatedAt = (timestamp: number) => new Intl.DateTimeFormat(props.t("locale"), { dateStyle: "medium", timeStyle: "medium" }).format(timestamp);
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
		<Show when={study.deck()?.kind !== "flashcards"}><Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed() || !study.errorCount(study.deck()!)} onClick={() => study.start(study.deck()!, "errors")}>{props.t("studyReviewErrors")} · {study.errorCount(study.deck()!)}</Button></Show>
		<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={study.setup}>{props.t("studyNewSession")}</Button>
	</>;
	return <Show when={presence.present()}>
		<div class={cx(styles.backdrop, study.kind() === "written" && study.stage() === "running" && styles.writtenBackdrop)} inert={presence.exiting()} aria-hidden={presence.exiting() || undefined} {...backdrop}
			ref={element => registerVisibilityAnimation(element, presence.exiting, "fade")}>
			<section class={cx(styles.dialog, (study.kind() === "flashcards" || study.kind() === "cloze" || study.kind() === "correction") && styles.flashcardDialog)} role="dialog" aria-modal="true" aria-labelledby={headingId}
				ref={element => registerVisibilityAnimation(element, presence.exiting, "dialog")}>
				<header class={styles.header}>
					<h2 class={styles.title} id={headingId}>{heading()}</h2>
					<div class={styles.headerActions}>
						<Button class={cx(styles.button, styles.icon)} type="button" aria-label={props.t("studyHome")} disabled={!study.canGoHome()} onClick={study.setup}><Icon name="reset" size={16} /></Button>
						<Button ref={closeButton} class={cx(styles.button, styles.icon)} type="button" aria-label={props.t("close")} onClick={study.close}><Icon name="close" size={16} /></Button>
					</div>
				</header>
				<div class={styles.content}>
				<CustomScrollArea viewportRef={element => { viewport = element; }} onScroll={element => { if (study.open()) study.setScrollTop(element.scrollTop); }}><div class={styles.body}>
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
								]} onChange={value => study.setCount(Number(value))} />
							</div>
							<Show when={study.kind() !== "flashcards"}>
								<div class={styles.label}><span>{props.t("studyLives")}</span>
									<Dropdown ariaLabel={props.t("studyLives")} value={String(study.lives())} options={[
										{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "5", label: "5" },
									]} onChange={value => study.setLives(Number(value))} />
								</div>
								<div class={styles.label}><span>{props.t("studySeconds")}</span>
									<Dropdown ariaLabel={props.t("studySeconds")} value={String(study.seconds())} options={[
										{ value: "30", label: props.t("studyThirtySeconds") },
										{ value: "60", label: props.t("studyOneMinute") },
										{ value: "300", label: props.t("studyFiveMinutes") },
									]} onChange={value => study.setSeconds(Number(value))} />
								</div>
							</Show>
						</div>


						<Show when={!props.connected}><p class={styles.muted}>{props.t("studyConnectFirst")}</p><Button class={styles.button} type="button" onClick={() => { study.close(); props.onConnect(); }}>{props.t("aiConnect")}</Button></Show>
						<Show when={props.connected && props.aiBusy}><p class={styles.muted} role="status">{busyMessage()}</p></Show>
						<Show when={study.storageFailed()}><Button class={styles.button} type="button" onClick={() => void study.retry()}>{props.t("retry")}</Button></Show>
						<Show when={study.loading()}><p class={styles.muted} role="status">{props.t("studyLoading")}</p></Show>
							<Show when={study.invalidSessions().length}>
								<p class={styles.error} role="alert">{props.t("studyInvalidSessions")}</p>
								<Button class={styles.button} type="button" disabled={study.loading()} onClick={() => void study.retry()}>{props.t("retry")}</Button>
								<For each={study.invalidSessions()}>{session => <div class={styles.sessionRow}>
									<span class={styles.muted}>{session.kind}/{session.id}.json</span>
									<Button class={cx(styles.button, styles.icon, styles.danger)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} aria-label={props.t("delete")} onClick={() => void study.remove(session.id)}><Icon name="delete" size={15} /></Button>
								</div>}</For>
							</Show>
						<Show when={study.saved().length}><div class={styles.library} role="region" aria-label={props.t("studySaved")}>
							<For each={study.saved()}>{deck => <div class={styles.libraryEntry}>
								<div class={styles.sessionRow}>
								<Button class={cx(styles.button, styles.sessionDate)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} onClick={() => study.start(deck)}><time dateTime={new Date(deck.createdAt).toISOString()}>{generatedAt(deck.createdAt)}</time></Button>
								<Button class={cx(styles.button, styles.icon, styles.danger)} type="button" disabled={study.loading() || study.savingProgress() || study.progressFailed()} aria-label={props.t("delete")} onClick={() => void study.remove(deck.id)}><Icon name="delete" size={15} /></Button>
								</div>
								<div class={styles.sessionControls}>
									<Show when={deck.kind === "flashcards"} fallback={<Button class={cx(styles.button, styles.sessionReview)} type="button" disabled={!study.errorCount(deck) || study.savingProgress() || study.progressFailed() || study.loading()} onClick={() => study.start(deck, "errors")}>{props.t("studyReviewErrors")} · {study.errorCount(deck)}</Button>}>
										<Button class={cx(styles.button, styles.sessionReview)} type="button" disabled={!study.dueCount(deck) || study.savingProgress() || study.progressFailed() || study.loading()} onClick={() => study.start(deck, "due")}>{props.t("studyReviewDue")} · {study.dueCount(deck)}</Button>
									</Show>
									<span class={styles.accuracyBox}>{props.t("studyAccuracy")}: {study.accuracy(deck) ?? 0}% · {deck.progress?.items.length ?? 0}/{deck.itemCount}</span>
									<Show when={deck.kind === "written" || deck.kind === "cloze"}>
										<Button class={cx(styles.button, styles.icon)} type="button" disabled={!deck.hasReport || study.loading() || study.savingProgress() || study.progressFailed()} aria-label={props.t("studyOpenReport")} onClick={() => study.viewReport(deck)}><Icon name="view" size={16} /></Button>
									</Show>
									<Button class={cx(styles.button, styles.icon)} type="button" disabled={!deck.progress?.items.length || study.savingProgress() || study.progressFailed() || study.loading()} aria-label={props.t("studyClearProgress")} onClick={() => void study.clearProgress(deck)}><Icon name="reset" size={16} /></Button>
								</div>
							</div>}</For>
						</div></Show>
					</Match>
					<Match when={study.stage() === "generating"}>
						<p class={cx(styles.muted, styles.generationStatus)} role="status">{props.t("studyGenerating")}</p>
					</Match>
					<Match when={study.stage() === "running"}>
						<div class={styles.status} aria-live="polite"><span>{study.index() + 1} / {study.sessionIndices().length}</span>
							<Show when={study.deck()?.kind !== "flashcards"}><span>{props.t("studyLives")}: {study.remainingLives()} · {study.remainingTime()}s</span></Show>
						</div>
						<Show when={study.current()}>{item => <>
							<Show when={study.deck()?.kind === "correction"}><CorrectionExercise study={study} t={props.t} /></Show>
							<Show when={study.deck()?.kind !== "correction"}>
							<Show when={study.deck()?.kind !== "cloze"} fallback={<ClozeExercise study={study} t={props.t} />}>
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
									<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(study.index() + 1 >= (study.sessionIndices().length ?? 0) || study.remainingLives() === 0 ? "studyResults" : "studyNext")}</Button>
								</Show>
							</Show>
							</>}>
								<WrittenAnswer study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote} />
							</Show>
							<Show when={study.revealed() || study.answered()}><div class={styles.actions}>
								<span class={styles.muted}>{props.t("studySources")}</span>
								<For each={item().sources}>{id => {
									const source = () => props.notes.find(note => note.id === id);
									return <Button class={styles.link} type="button" disabled={!source()} onClick={() => { const note = source(); if (note) { study.close(); props.onOpenNote(note); } }}>{source()?.title ?? props.referenceTitles[id] ?? props.t("studyDeletedSource")}</Button>;
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
							<AnswerResults study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote}
								responses={(deck().progress?.responses ?? []).map(entry => ({ ...entry, status: "done" as const, item: deck().items[entry.itemIndex] }))} />
						</>}</Show>
					</Match>
					<Match when={study.stage() === "result"}>
						<h3 class={styles.question}>{props.t("studyResults")}</h3>
						<p class={styles.muted}>{props.t("studyScore")}: {study.correct()} / {study.sessionIndices().length ?? 0}</p>
						<Show when={study.endReason() !== "complete"}><p class={styles.muted}>{props.t("studyNoLives")}</p></Show>
						<Show when={study.deck()?.kind === "written" || study.deck()?.kind === "cloze"}><AnswerResults study={study} notes={props.notes} referenceTitles={props.referenceTitles} t={props.t} onOpenNote={props.onOpenNote} /></Show>
						<Show when={study.kind() === "flashcards"}><div class={styles.actions}><ResultActions /></div></Show>
					</Match>
				</Switch>
				</div></CustomScrollArea></div>
				<Show when={study.stage() === "result" && study.kind() !== "flashcards"}>
					<footer class={styles.footer}><div class={styles.clozeNavigation}><ResultActions /></div></footer>
				</Show>
				<Show when={study.stage() === "setup"}>
					<footer class={styles.footer}>
						<Button class={styles.button} type="button" disabled={!props.canGenerate || study.loading() || study.storageFailed() || study.savingProgress() || study.progressFailed()} onClick={() => void study.generate()}>{props.t("studyGenerate")}</Button>
					</footer>
				</Show>
				<Show when={study.stage() === "generating"}>
					<footer class={styles.footer}>
						<Button class={styles.button} type="button" disabled={!study.canGoHome()} onClick={study.setup}>{props.t("cancel")}</Button>
					</footer>
				</Show>
				<Show when={study.stage() === "grading"}>
					<footer class={styles.footer}>
						<Button class={styles.button} type="button" onClick={study.close}>{props.t("close")}</Button>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "written" && !study.answered()}>
					<footer class={styles.footer}>
						<Button class={styles.button} type="button" disabled={!props.connected || !study.review.draft().trim()}
							onClick={() => void study.review.submit()}>{props.t("studyWrittenSubmit")}</Button>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "flashcards"}>
					<footer class={styles.flashcardFooter}>
						<div class={styles.ratings}>
							<For each={["easy", "medium", "hard"] as const}>{rating => <Button class={styles.button} type="button" disabled={!study.revealed() || study.answered() || study.savingProgress() || study.progressFailed()} onClick={() => study.mark(rating)}>
								{props.t(rating === "easy" ? "studyEasy" : rating === "medium" ? "studyMedium" : "studyHard")}
								<span class={styles.sessionSubtitle}>{study.ratingInterval(rating) < 86_400_000 ? props.t("studyReviewMinutes").replace("{count}", String(study.ratingInterval(rating) / 60_000)) : props.t("studyReviewDays").replace("{count}", String(study.ratingInterval(rating) / 86_400_000))}</span>
							</Button>}</For>
						</div>
						<div class={styles.flashcardNavigation}>
							<Button class={styles.button} type="button" disabled={study.revealed() || study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.reveal}>{props.t("studyReveal")}</Button>
							<Button class={styles.button} type="button" disabled={!study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(study.index() + 1 >= study.sessionIndices().length ? "studyResults" : "studyNext")}</Button>
						</div>
					</footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "cloze"}>
					<footer class={styles.footer}><div class={styles.clozeActions}>
						<Button class={styles.button} type="button" disabled={study.savingProgress() || study.progressFailed()} onClick={study.cloze.skip}>{props.t("studySkip")}</Button>
						<Button class={styles.button} type="button" disabled={!props.connected || !study.cloze.complete() || study.savingProgress() || study.progressFailed()} onClick={study.cloze.submit}>{props.t("studyWrittenSubmit")}</Button>
					</div></footer>
				</Show>
				<Show when={study.stage() === "running" && study.deck()?.kind === "correction"}>
					<footer class={styles.footer}><div class={styles.clozeNavigation}>
						<Button class={styles.button} type="button" disabled={study.answered() || !study.correction.selected().size || study.savingProgress() || study.progressFailed()} onClick={study.correction.submit}>{props.t("studyCorrectionCheck")}</Button>
						<Button class={styles.button} type="button" disabled={study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.correction.reveal}>{props.t("studyReveal")}</Button>
						<Button class={styles.button} type="button" disabled={!study.answered() || study.savingProgress() || study.progressFailed()} onClick={study.next}>{props.t(study.index() + 1 >= study.sessionIndices().length || study.remainingLives() === 0 ? "studyResults" : "studyNext")}</Button>
					</div></footer>
				</Show>
				<Show when={study.stage() === "report"}>
					<footer class={styles.footer}><Button class={styles.button} type="button" onClick={study.setup}>{props.t("studyBackToSessions")}</Button></footer>
				</Show>
			</section>
		</div>
	</Show>;
};
export default StudyDialog;
