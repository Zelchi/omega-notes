import Input from "@/shared/ui/input";
import { onCleanup, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { createLongPress } from "../../model/long-press";
import { styles } from "./style.css.ts";

type Props = {
	aiEnabled: boolean;
	disabled?: boolean;
	onAiChange: (enabled: boolean) => void;
	onGambiarraLongPress: () => void;
	t: (key: TranslationKey) => string;
};

const AiFeaturesToggle: Component<Props> = props => {
	const longPress = createLongPress(props.onGambiarraLongPress);
	onCleanup(longPress.cancel);

	return <label class={styles.option}
		onPointerDown={event => { if (event.button === 0 && !props.disabled) longPress.start(); }}
		onPointerUp={longPress.cancel}
		onPointerLeave={longPress.cancel}
		onPointerCancel={longPress.cancel}
		onClick={event => {
			if (!longPress.consume()) return;
			event.preventDefault();
			event.stopPropagation();
		}}>
		<span>{props.t("aiFeatures")}</span>
		<Input class={styles.toggle} type="checkbox" checked={props.aiEnabled} disabled={props.disabled}
			onChange={event => {
				if (longPress.consume()) {
					event.currentTarget.checked = props.aiEnabled;
					return;
				}
				props.onAiChange(event.currentTarget.checked);
			}} />
	</label>;
};

export default AiFeaturesToggle;
