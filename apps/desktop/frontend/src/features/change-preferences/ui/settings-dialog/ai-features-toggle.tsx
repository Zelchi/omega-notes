import Input from "@/shared/ui/input";
import type { Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "./style.css.ts";

type Props = {
	aiEnabled: boolean;
	disabled?: boolean;
	onAiChange: (enabled: boolean) => void;
	t: (key: TranslationKey) => string;
};

const AiFeaturesToggle: Component<Props> = props => {
	return <label class={styles.option}>
		<span>{props.t("aiFeatures")}</span>
		<Input class={styles.toggle} type="checkbox" checked={props.aiEnabled} disabled={props.disabled}
			onChange={event => props.onAiChange(event.currentTarget.checked)} />
	</label>;
};

export default AiFeaturesToggle;
