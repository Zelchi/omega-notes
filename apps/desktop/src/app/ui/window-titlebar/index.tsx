import { Show, type Component } from "solid-js";
import Icon from "@/shared/ui/icon";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

const iconUrl = "/icon.png";

type Props = {
	maximized: boolean;
	vaultName?: string;
	t: (key: TranslationKey) => string;
	onVaultClick: () => void;
	onSettings: () => void;
	onAiChat: () => void;
	aiChatOpen: boolean;
	aiFeaturesEnabled: boolean;
	onMinimize: () => void;
	onToggleMaximize: () => void;
	onClose: () => void;
};

const WindowTitlebar: Component<Props> = (props) => (
	<header class={styles.bar} data-omega-titlebar>
		<div class={styles.brand} data-tauri-drag-region>
			<img class={styles.mark} data-tauri-drag-region src={iconUrl} alt="" />
			<span data-tauri-drag-region>{props.t("windowName")}</span>
		</div>
		<Show when={props.vaultName}>
			<button class={styles.vaultName} type="button" onClick={props.onVaultClick}>
				{props.vaultName}
			</button>
		</Show>
		<div class={styles.drag} data-tauri-drag-region />
		<Show when={isTauriRuntime()}>
			<div class={styles.controls} onPointerDown={(event) => event.stopPropagation()}>
				<Show when={props.aiFeaturesEnabled}>
					<button class={styles.button} type="button" disabled={!props.vaultName} aria-label={props.t("aiChat")}
						aria-expanded={props.aiChatOpen} aria-controls="ai-chat-panel" onClick={props.onAiChat}>
						<Icon name="chat" size={15} />
					</button>
				</Show>
				<button class={styles.button} type="button" aria-label={props.t("settings")} onClick={props.onSettings}>
					<Icon name="settings" size={15} />
				</button>
				<button class={styles.button} type="button" aria-label={props.t("minimize")} onClick={props.onMinimize}>
					<Icon name="minimize" size={14} />
				</button>
				<button
					class={styles.button}
					type="button"
					aria-label={props.t(props.maximized ? "restore" : "maximize")}
					onClick={props.onToggleMaximize}
				>
					<Icon name={props.maximized ? "restore" : "maximize"} size={14} />
				</button>
				<button
					class={cx(styles.button, styles.closeButton)}
					type="button"
					aria-label={props.t("close")}
					onClick={props.onClose}
				>
					<Icon name="close" size={14} />
				</button>
			</div>
		</Show>
	</header>
);

export default WindowTitlebar;
