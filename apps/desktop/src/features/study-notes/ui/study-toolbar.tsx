import Tooltip from "@/shared/ui/tooltip";
import { Show, createEffect, createSignal, createUniqueId, onCleanup, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { toolbarStyles } from "@/shared/ui/toolbar/style.css";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StudiesController } from "../model/controller";
import { styles } from "./style.css";

const StudyToolbar: Component<{ study: StudiesController; visible: boolean; aiEnabled: boolean; t: (key: TranslationKey) => string }> = props => {
	const presence = createPresence(() => props.visible, 220), menuId = createUniqueId();
	const [expanded, setExpanded] = createSignal(false);
	const menuPresence = createPresence(expanded, 180);
	let root: HTMLDivElement | undefined, trigger: HTMLButtonElement | undefined;
	createEffect(() => { if (!props.visible || !props.aiEnabled || props.study.open()) setExpanded(false); });
	createEffect(() => {
		if (!expanded()) return;
		const outside = (event: PointerEvent) => { if (root && !root.contains(event.target as Node)) setExpanded(false); };
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault(); event.stopImmediatePropagation(); setExpanded(false); trigger?.focus({ preventScroll: true });
		};
		window.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", escape, true);
		onCleanup(() => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true); });
	});
	return <Show when={presence.present()}>
		<div ref={element => { root = element; registerVisibilityAnimation(element, presence.exiting, "bar"); }}
			class={toolbarStyles.root} inert={presence.exiting()} aria-hidden={presence.exiting() || undefined}>
			<Show when={props.aiEnabled && menuPresence.present()}>
				<div class={styles.studySubbar} inert={menuPresence.exiting()} aria-hidden={menuPresence.exiting() || undefined}
					ref={element => registerVisibilityAnimation(element, menuPresence.exiting, "bar")}>
					<div id={menuId} class={toolbarStyles.row} role="toolbar" aria-label={props.t("studyTools")}>
						<Show when={props.aiEnabled}>
							<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyFlashcards")} onClick={() => { setExpanded(false); props.study.show("flashcards"); }}><Icon name="flashcards" size={17} /></Button>
							<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyQuiz")} onClick={() => { setExpanded(false); props.study.show("quiz"); }}><Icon name="quiz" size={17} /></Button>
							<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyWrittenQuiz")} onClick={() => { setExpanded(false); props.study.show("written"); }}><Icon name="recall" size={17} /></Button>
							<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyCloze")} onClick={() => { setExpanded(false); props.study.show("cloze"); }}><Icon name="cloze" size={17} /></Button>
							<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyCorrection")} onClick={() => { setExpanded(false); props.study.show("correction"); }}><Icon name="correction" size={17} /></Button>
						</Show>
					</div>
				</div>
			</Show>
			<div class={toolbarStyles.row} role="toolbar" aria-label={props.t("studyTools")}>
				<Button class={toolbarStyles.button} type="button" aria-label={props.t("studyRandomNote")}
					disabled={!props.study.canRandom()} onClick={props.study.randomNote}><Icon name="random" size={17} /></Button>
				<Show when={props.aiEnabled}>
				<span class={toolbarStyles.divider} aria-hidden="true" />
				<Button ref={trigger} class={toolbarStyles.button} type="button" aria-label={props.t("studyMenu")} aria-expanded={expanded()} aria-controls={menuId}
					onClick={() => setExpanded(value => !value)}><Icon name="study" size={17} /></Button>
				</Show>
			</div>
			<Tooltip root={() => root} enabled={!presence.exiting() && !props.study.open()} />
		</div>
	</Show>;
};
export default StudyToolbar;
