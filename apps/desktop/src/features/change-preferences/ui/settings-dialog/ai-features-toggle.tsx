import { createEffect, onCleanup, onMount, type Component } from "solid-js";
import Input from "@/shared/ui/input";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "./style.css.ts";

type Props = {
	aiEnabled: boolean;
	gambiarraEnabled: boolean;
	disabled?: boolean;
	onAiChange: (enabled: boolean) => void;
	onGambiarraChange: (enabled: boolean) => void;
	t: (key: TranslationKey) => string;
};

/** A short click retains the regular checkbox action; a completed hold consumes its click. */
const AiFeaturesToggle: Component<Props> = props => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let activatedByHold = false;
	let gesture: "pointer" | "keyboard" | undefined;
	let label!: HTMLLabelElement;
	const eligible = () => !props.disabled && !props.aiEnabled && !props.gambiarraEnabled;
	const cancel = () => { clearTimeout(timer); timer = undefined; gesture = undefined; };
	const start = (source: "pointer" | "keyboard") => {
		if (gesture) return;
		activatedByHold = false;
		if (!eligible()) return;
		gesture = source;
		timer = setTimeout(() => {
			timer = undefined;
			if (!eligible() || document.hidden || !document.hasFocus()) return;
			activatedByHold = true;
			props.onGambiarraChange(true);
		}, 5000);
	};
	createEffect(() => { if (!eligible()) cancel(); });
	onMount(() => {
		const hidden = () => { if (document.hidden) cancel(); };
		const consumeHoldClick = (event: MouseEvent) => {
			if (activatedByHold) { event.preventDefault(); activatedByHold = false; }
		};
		label.addEventListener("click", consumeHoldClick, true);
		window.addEventListener("blur", cancel);
		document.addEventListener("visibilitychange", hidden);
		onCleanup(() => {
			label.removeEventListener("click", consumeHoldClick, true);
			window.removeEventListener("blur", cancel);
			document.removeEventListener("visibilitychange", hidden);
		});
	});
	onCleanup(cancel);
	return <label ref={label} class={styles.option}
		onPointerDown={event => { if (event.isPrimary && event.button === 0) start("pointer"); }}
		onPointerUp={() => { if (gesture === "pointer") cancel(); }}
		onPointerLeave={() => { if (gesture === "pointer") cancel(); }}
		onPointerCancel={cancel}
		onKeyDown={event => { if (event.key === " " && !event.repeat) start("keyboard"); }}
		onKeyUp={event => { if (event.key === " " && gesture === "keyboard") cancel(); }}
		onBlur={cancel}
	>
		<span>{props.t(props.gambiarraEnabled ? "gambiarra" : "aiFeatures")}</span>
		<Input class={styles.toggle} type="checkbox" checked={props.aiEnabled || props.gambiarraEnabled} disabled={props.disabled}
			onChange={event => {
				if (props.gambiarraEnabled) props.onGambiarraChange(false);
				else props.onAiChange(event.currentTarget.checked);
			}} />
	</label>;
};

export default AiFeaturesToggle;
