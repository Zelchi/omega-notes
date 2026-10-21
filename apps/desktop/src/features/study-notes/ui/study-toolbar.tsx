import Tooltip from "@/shared/ui/tooltip";
import { Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { toolbarStyles } from "@/shared/ui/toolbar/style.css";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StudiesController } from "../model/controller";

const StudyToolbar: Component<{ study: StudiesController; visible: boolean; aiEnabled: boolean; t: (key: TranslationKey) => string }> = props => {
	const presence = createPresence(() => props.visible, 220);
	let root: HTMLDivElement | undefined;
	return <Show when={presence.present()}>
		<div ref={element => { root = element; registerVisibilityAnimation(element, presence.exiting, "bar"); }}
			class={toolbarStyles.root} inert={presence.exiting()} aria-hidden={presence.exiting() || undefined}>
			<div class={toolbarStyles.row} role="toolbar" aria-label={props.t("studyTools")}>
				<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyRandomNote")}
					disabled={!props.study.canRandom()} onClick={props.study.randomNote}><Icon name="random" size={17} /></Button>
				<Show when={props.aiEnabled}>
					<span class={toolbarStyles.divider} aria-hidden="true" />
					<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyFlashcards")} onClick={() => props.study.show("flashcards")}><Icon name="flashcards" size={17} /></Button>
					<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyQuiz")} onClick={() => props.study.show("quiz")}><Icon name="quiz" size={17} /></Button>
					<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyWrittenQuiz")} onClick={() => props.study.show("written")}><Icon name="recall" size={17} /></Button>
					<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyCloze")} onClick={() => props.study.show("cloze")}><Icon name="cloze" size={17} /></Button>
					<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyCorrection")} onClick={() => props.study.show("correction")}><Icon name="correction" size={17} /></Button>
				</Show>
			</div>
			<Tooltip root={() => root} enabled={!presence.exiting() && !props.study.open()} />
		</div>
	</Show>;
};
export default StudyToolbar;
