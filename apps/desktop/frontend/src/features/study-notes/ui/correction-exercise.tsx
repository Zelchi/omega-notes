import { For, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import Button from "@/shared/ui/button";
import { cx } from "@/shared/lib/classes";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css";

const CorrectionExercise: Component<{ study: StudiesController; t: (key: TranslationKey) => string }> = props => {
	const study = props.study;
	const summary = () => {
		const segments = study.current()?.segments ?? [], selected = study.correction.selected();
		return props.t("studyCorrectionSummary")
			.replace("{found}", String(segments.filter((segment, index) => segment.incorrect && selected.has(index)).length))
			.replace("{total}", String(segments.filter(segment => segment.incorrect).length))
			.replace("{extra}", String(segments.filter((segment, index) => !segment.incorrect && selected.has(index)).length));
	};
	return <>
		<p class={styles.muted}>{props.t("studyCorrectionInstructions")}</p>
		<div class={styles.card}>
			<div class={styles.correctionText}><For each={study.current()?.segments}>{(segment, index) =>
				<Button type="button" class={cx(styles.correctionSegment,
					study.correction.selected().has(index()) && styles.correctionSelected,
					study.answered() && segment.incorrect !== study.correction.selected().has(index()) && styles.correctionError)}
					aria-pressed={study.correction.selected().has(index())}
					disabled={study.answered() || study.savingProgress() || study.progressFailed()}
					onClick={() => study.correction.toggle(index())}>{segment.text}</Button>
			}</For></div>
			<Show when={study.answered()}><div class={styles.answer}>
				<p class={styles.muted} role="status">{props.t(study.outcome() === "timeout" ? "studyTimeout" : study.outcome() === "correct" ? "studyCorrect" : "studyWrong")}</p>
				<p class={styles.muted}>{summary()}</p>
				<p class={styles.muted}>{props.t("studyCorrectionLegend")}</p>
				<h3 class={styles.question}>{props.t("studyCorrectionSolution")}</h3>
				<p class={styles.clozeSolution}>{study.current()?.answer}</p>
				<p class={styles.muted}>{study.current()?.explanation}</p>
			</div></Show>
		</div>
	</>;
};
export default CorrectionExercise;
