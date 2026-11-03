import "./electron.css";
import Button from "@/shared/ui/button";
import { Show, type Component } from "solid-js";
import Icon from "@/shared/ui/icon";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import type { BackgroundTheme } from "@/features/change-preferences";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { styles } from "./style.css.ts";

const iconUrl = `${import.meta.env.BASE_URL}icon.png`;

const runAppAction = (
	action: () => void,
	kind: "panel" | "modal",
	vaultDialogOpen: boolean,
	vaultDialogCanHide: boolean,
) => {
	const modalOpen = Array.from(document.querySelectorAll('[aria-modal="true"]'))
		.some(dialog => !dialog.closest("[inert]"));
	if (modalOpen && (kind === "panel" || (vaultDialogOpen && !vaultDialogCanHide))) return;
	action();
};

type Props = {
	maximized: boolean;
	gnome: boolean | undefined;
	backgroundTheme: BackgroundTheme;
	settingsOpen: boolean;
	vaultDialogOpen: boolean;
	vaultDialogCanHide: boolean;
	vaultName?: string;
	t: (key: TranslationKey) => string;
	onVaultClick: () => void;
	onSettings: () => void;
	onAiChat: () => void;
	aiChatOpen: boolean;
	aiChatShortcut: string;
	aiFeaturesEnabled: boolean;
	kanbanOpen: boolean;
	kanbanShortcut: string;
	onKanban: () => void;
	pomodoroOpen: boolean;
	onPomodoro: () => void;
	onMinimize: () => void;
	onToggleMaximize: () => void;
	onClose: () => void;
};

const WindowTitlebar: Component<Props> = (props) => (
	<header class={styles.bar} data-omega-titlebar
		onDblClick={(event) => {
			if (event.target instanceof Element && event.target.closest("button")) return;
			event.preventDefault();
			void props.onToggleMaximize();
		}}
		style={{ "background-color": props.backgroundTheme === "default" ? undefined : "transparent" }}>
		<AsciiBackdrop theme={props.backgroundTheme} />
		<div class={styles.left}>
			<div class={styles.brand} data-omega-drag-region data-tauri-drag-region>
				<img class={styles.mark} data-omega-drag-region data-tauri-drag-region src={iconUrl} alt="" />
			</div>
			<Button class={cx(styles.button, styles.kanbanButton)} type="button" disabled={!props.vaultName} aria-label={props.t("kanbanOpen")}
				aria-expanded={props.kanbanOpen} aria-controls="kanban-panel" aria-keyshortcuts={props.kanbanShortcut}
				onClick={() => runAppAction(props.onKanban, "panel", props.vaultDialogOpen, props.vaultDialogCanHide)}>
				<Icon name="bulletList" size={16} />
			</Button>
			<Button class={cx(styles.button, styles.pomodoroButton)} type="button" disabled={!props.vaultName} aria-label={props.t("pomodoroOpen")}
				aria-expanded={props.pomodoroOpen} aria-controls="pomodoro-panel"
				onClick={() => runAppAction(props.onPomodoro, "panel", props.vaultDialogOpen, props.vaultDialogCanHide)}>
				<Icon name="clock" size={16} />
			</Button>
			<div class={styles.drag} data-omega-drag-region data-tauri-drag-region />
		</div>
		<Show when={props.vaultName}>
			<Button class={styles.vaultName} type="button" onClick={() => props.vaultDialogOpen ? props.onVaultClick() : runAppAction(props.onVaultClick, "modal", props.vaultDialogOpen, props.vaultDialogCanHide)}>
				{props.vaultName}
			</Button>
		</Show>
		<Show when={isDesktopRuntime()}>
			<div class={styles.right}>
				<div class={styles.drag} data-omega-drag-region data-tauri-drag-region />
				<div class={styles.controls} onPointerDown={(event) => event.stopPropagation()}>
					<Show when={props.aiFeaturesEnabled}>
						<Button class={styles.button} type="button" disabled={!props.vaultName} aria-label={props.t("aiChat")}
							aria-expanded={props.aiChatOpen} aria-controls="ai-chat-panel" aria-keyshortcuts={props.aiChatShortcut}
							onClick={() => runAppAction(props.onAiChat, "panel", props.vaultDialogOpen, props.vaultDialogCanHide)}>
							<Icon name="chat" size={15} />
						</Button>
					</Show>
					<Button class={styles.button} type="button" aria-label={props.t("settings")} aria-expanded={props.settingsOpen}
						onClick={() => props.settingsOpen ? props.onSettings() : runAppAction(props.onSettings, "modal", props.vaultDialogOpen, props.vaultDialogCanHide)}>
						<Icon name="settings" size={15} />
					</Button>
					<Show when={props.gnome === false}>
						<Button class={styles.button} type="button" aria-label={props.t("minimize")} onClick={props.onMinimize}>
							<Icon name="minimize" size={14} />
						</Button>
						<Button
							class={styles.button}
							type="button"
							aria-label={props.t(props.maximized ? "restore" : "maximize")}
							onClick={props.onToggleMaximize}
						>
							<Icon name={props.maximized ? "restore" : "maximize"} size={14} />
						</Button>
					</Show>
					<Button
						class={cx(styles.button, styles.closeButton)}
						type="button"
						aria-label={props.t("trayHide")}
						onClick={props.onClose}
					>
						<Icon name="close" size={14} />
					</Button>
				</div>
			</div>
		</Show>
	</header>
);

export default WindowTitlebar;
