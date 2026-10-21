import Button from "@/shared/ui/button";
import type { Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { UpdatesController } from "../model/updates.controller";
import desktopPackage from "../../../../package.json";
import { styles } from "./style.css";

export const CheckForUpdatesButton: Component<{
	t: (key: TranslationKey) => string;
	updates: UpdatesController;
}> = (props) => {
	const label = () => {
		switch (props.updates.status()) {
			case "available": return `${desktopPackage.version} > ${props.updates.version()}`;
			case "downloading": return props.t("updateDownloading");
			case "installing": return props.t("updateInstalling");
			default: return desktopPackage.version;
		}
	};
	return (
		<div class={styles.row}>
			<span class={styles.version}>{props.t("appVersion")}</span>
			<Button class={styles.button} type="button" disabled={props.updates.busy()}
				aria-busy={props.updates.busy()}
				onClick={() => void props.updates.activate()}>
				<span aria-live="polite" aria-atomic="true">{label()}</span>
			</Button>
		</div>
	);
};
