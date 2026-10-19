import { For, Show, createEffect, createMemo, createUniqueId, onCleanup, type Component } from "solid-js";
import { createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference, type StudyNote } from "@/entities/note";
import { NoteContentText } from "@/entities/note/ui";
import type { TranslationKey } from "@/shared/lib/i18n";
import Button from "@/shared/ui/button";
import Textarea from "@/shared/ui/textarea";
import TextCaret from "@/shared/ui/text-caret";
import { useTextareaCaret } from "@/shared/ui/text-caret/use-textarea-caret";
import { CustomScrollbars, useCustomScrollArea } from "@/shared/ui/custom-scroll-area";
import { splitClozeText } from "@/entities/study";
import { cx } from "@/shared/lib/classes";
import type { StudyResponse } from "../model/answer-review.controller";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css.ts";

const WrittenDraft: Component<{ study: StudiesController; t: (key: TranslationKey) => string }> = props => {
	const caret = useTextareaCaret(), scroll = useCustomScrollArea();
	const inputId = createUniqueId();
	let input: HTMLTextAreaElement | undefined, frame = 0, metricsFrame = 0;
	createEffect(() => {
		props.study.index();
		const writing = props.study.open() && props.study.stage() === "running";
		cancelAnimationFrame(frame);
		if (writing) frame = requestAnimationFrame(() => {
			const selection = props.study.review.selection();
			input?.focus({ preventScroll: true });
			input?.setSelectionRange(selection.start, selection.end);
			caret.scheduleMeasure();
		});
	});
	createEffect(() => {
		props.study.review.draft(); caret.scheduleMeasure();
		cancelAnimationFrame(metricsFrame); metricsFrame = requestAnimationFrame(scroll.updateMetrics);
	});
	onCleanup(() => { cancelAnimationFrame(frame); cancelAnimationFrame(metricsFrame); });
	return <div class={styles.writtenDraft}>
		<div class={styles.status}><label for={inputId}>{props.t("studyWrittenAnswer")}</label><span>{props.study.review.draft().length} / 4000</span></div>
		<div class={styles.writtenInputRoot} ref={scroll.setRoot} data-omega-scroll-root
			onPointerMove={scroll.moveThumb} onPointerUp={scroll.finishDrag} onPointerCancel={scroll.finishDrag} onLostPointerCapture={scroll.finishDrag}>
			<Textarea id={inputId} class={styles.writtenInput} maxlength={4000} value={props.study.review.draft()} spellcheck={false} readOnly={props.study.stage() !== "running"}
				placeholder={props.t("studyWrittenPlaceholder")} data-omega-scroll-viewport
				ref={element => { input = element; caret.bind(element); scroll.setViewport(element); scroll.setContent(element); }}
				onInput={event => {
					props.study.review.setDraft(event.currentTarget.value);
					props.study.review.setSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
				}}
				onSelect={event => props.study.review.setSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)} />
			<div class={styles.writtenCaretClip} aria-hidden="true"><TextCaret geometry={caret.caret()} /></div>
			<CustomScrollbars scroll={scroll} />
		</div>
	</div>;
};

type WrittenProps = {
	responses?: StudyResponse[]; study: StudiesController; notes: StudyNote[]; referenceTitles: Record<string, string>;
	t: (key: TranslationKey) => string; onOpenNote: (note: StudyNote) => void;
};
const WrittenAnswer: Component<WrittenProps> = props => <>
	<WrittenDraft study={props.study} t={props.t} />
	<Show when={props.study.review.error()}><p class={styles.error} role="alert">{props.study.review.error()}</p></Show>
	<Show when={props.study.review.pending()}><p class={styles.muted} role="status">{props.t("studyWrittenPending").replace("{count}", String(props.study.review.pending()))}</p></Show>
</>;

const AnswerResult: Component<WrittenProps & {
	response: StudyResponse; noteIndex: Map<string, StudyNote>; resolveNote: (target: string) => StudyNote | undefined;
}> = props => {
	const resolveNote = (target: string) => props.resolveNote(target);
	const openSource = (note: StudyNote) => { props.study.close(); props.onOpenNote(note); };
	const answerParts = createMemo(() => splitClozeText(props.response.item.question));
	const answerTone = (correct?: boolean) => correct === undefined ? undefined : correct ? styles.reportCorrect : styles.reportWrong;
	const groups = () => {
		const feedback = props.response.feedback;
		return feedback ? [
			{ title: props.t("studyWrittenStrengths"), items: feedback.strengths },
			{ title: props.t("studyWrittenGaps"), items: feedback.gaps },
			{ title: props.t("studyWrittenCorrections"), items: feedback.corrections },
		] : [];
	};
	return <section class={styles.writtenFeedback}>
		<h3 class={styles.question}>{props.response.item.blanks ? props.response.item.answer : props.response.item.question}</h3>
		<p class={styles.muted}>{props.t(props.response.outcome === "skipped" ? "studySkipped" : props.response.outcome === "timeout" ? "studyTimeout" : props.response.outcome === "correct" ? "studyCorrect" : "studyWrong")}</p>
		<h4 class={styles.question}>{props.t("studyWrittenAnswer")}</h4>
		<Show when={props.response.item.blanks && props.response.blankAnswers} fallback={
			<p class={cx(styles.writtenSource, !props.response.item.blanks && answerTone(props.response.feedback?.correct))}>{props.response.answer || "—"}</p>
		}>
			<p class={styles.writtenSource}><For each={answerParts()}>{part => part.blankIndex === undefined ? part.text :
				<span class={answerTone(props.response.feedback?.blankResults?.[part.blankIndex])}>{props.response.blankAnswers?.[part.blankIndex] || "____"}</span>
			}</For></p>
		</Show>
		<Show when={!props.response.item.blanks}>
			<h4 class={styles.question}>{props.t("studyWrittenReferenceAnswer")}</h4>
			<NoteContentText text={props.response.item.answer} class={styles.writtenSource} referenceTitles={props.referenceTitles} resolveNote={resolveNote} onOpenNote={openSource} t={props.t} linkClass={styles.link} />
		</Show>
		<Show when={props.response.feedback}>{feedback => <>
			<h4 class={styles.question}>{props.t("studyWrittenFeedback")}</h4>
			<NoteContentText text={feedback().summary} class={styles.muted} referenceTitles={props.referenceTitles} resolveNote={resolveNote} onOpenNote={openSource} t={props.t} linkClass={styles.link} />
			<For each={groups()}>{group => <Show when={group.items.length}><div class={styles.writtenFeedback}>
				<h4 class={styles.question}>{group.title}</h4>
				<For each={group.items}>{item => <div class={styles.writtenFinding}>
					<NoteContentText text={item.text} class={styles.muted} referenceTitles={props.referenceTitles} resolveNote={resolveNote} onOpenNote={openSource} t={props.t} linkClass={styles.link} />
					<div class={styles.actions}><For each={item.sources}>{id => {
							const note = () => props.noteIndex.get(normalizeNoteTitle(id));
						return <Button class={styles.link} type="button" disabled={!note()} onClick={() => { const source = note(); if (source) openSource(source); }}>{note()?.title ?? props.referenceTitles[id] ?? props.t("studyDeletedSource")}</Button>;
					}}</For></div>
				</div>}</For>
			</div></Show>}</For>
		</>}</Show>
	</section>;
};
export const AnswerResults: Component<WrittenProps> = props => {
	const responses = () => props.responses ?? props.study.review.responses();
	const byId = createMemo(() => new Map(props.notes.map(note => [normalizeNoteTitle(note.id), note])));
	const byTitle = createMemo(() => createNoteTitleIndex(props.notes));
	const resolveNote = (target: string) => resolveNoteReference(target, byId(), byTitle());
	return <For each={responses()}>{(response, index) => <>
		<AnswerResult {...props} response={response} noteIndex={byId()} resolveNote={resolveNote} />
		<Show when={index() < responses().length - 1}><hr class={styles.reportDivider} /></Show>
	</>}</For>;
};
export default WrittenAnswer;
