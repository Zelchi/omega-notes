import type { Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { UpdatesController } from "../model/updates.controller";
import { styles } from "./style.css";

export const CheckForUpdatesButton: Component<{
	t: (key: TranslationKey) => string;
	updates: UpdatesController;
}> = (props) => {
	const label = () => {
		switch (props.updates.status()) {
			case "checking": return props.t("checkingUpdates");
			case "current": return props.t("appUpToDate");
			case "available": return `${props.t("updateAvailable")} ${props.updates.version()}`;
			case "downloading": {
				const progress = props.updates.progress();
				return `${props.t("downloadingUpdate")}${progress === undefined ? "" : ` ${progress}%`}`;
			}
			case "installing": return props.t("installingUpdate");
			case "failed": return props.t("updateCheckFailed");
			case "unavailable": return props.t("updateCheckUnavailable");
			default: return props.t("checkForUpdates");
		}
	};
	return <button class={styles.button} type="button" disabled={props.updates.busy()}
		aria-busy={props.updates.busy()}
		onClick={() => void props.updates.activate()}>
		<span aria-live="polite" aria-atomic="true">{label()}</span>
	</button>;
};
