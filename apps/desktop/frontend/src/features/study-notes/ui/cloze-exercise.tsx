import { createEffect, createMemo, For, onCleanup, Show, type Component } from "solid-js";
import { splitClozeText } from "@/entities/study";
import type { TranslationKey } from "@/shared/lib/i18n";
import Input from "@/shared/ui/input";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css";

const ClozeExercise: Component<{ study: StudiesController; t: (key: TranslationKey) => string }> = props => {
	const study = props.study, parts = createMemo(() => splitClozeText(study.current()?.question ?? ""));
	const inputs = new Map<number, HTMLInputElement>();
	createEffect(() => {
		study.index();
		if (!study.open() || study.answered()) return;
		const frame = requestAnimationFrame(() => inputs.get(study.cloze.activeBlank())?.focus({ preventScroll: true }));
		onCleanup(() => cancelAnimationFrame(frame));
	});
	return <>
		<p class={styles.muted}>{props.t("studyClozeInstructions")}</p>
		<div class={styles.card}>
			<div class={styles.clozeText}><For each={parts()}>{part => <Show when={part.blankIndex !== undefined} fallback={part.text}>
				{(() => {
					const index = part.blankIndex!;
					return <span class={styles.clozeField}>
						<Input type="text" ref={element => inputs.set(index, element)} class={styles.clozeInput}
							value={study.cloze.answers()[index] ?? ""} maxlength={200} spellcheck={false} autocomplete="off" readOnly={study.answered()}
							aria-label={props.t("studyClozeBlank").replace("{number}", String(index + 1))} placeholder="…"
							onFocus={() => study.cloze.setActiveBlank(index)} onInput={event => study.cloze.setAnswer(index, event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key !== "Enter" || event.isComposing || study.answered()) return;
								event.preventDefault();
								const next = index + 1 < (study.current()?.blanks?.length ?? 0) ? inputs.get(index + 1) : undefined;
								if (next) next.focus({ preventScroll: true }); else study.cloze.submit();
							}} />
					</span>;
				})()}
			</Show>}</For></div>
		</div>
		<Show when={study.review.error()}><p class={styles.error} role="alert">{study.review.error()}</p></Show>
		<Show when={study.review.pending()}><p class={styles.muted} role="status">{props.t("studyWrittenPending").replace("{count}", String(study.review.pending()))}</p></Show>
	</>;
};
export default ClozeExercise;
