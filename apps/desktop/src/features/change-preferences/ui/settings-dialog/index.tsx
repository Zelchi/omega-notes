import Button from "@/shared/ui/button";
import Input from "@/shared/ui/input";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { Show, type Component, type JSX } from "solid-js";
import type { Language, TranslationKey } from "@/shared/lib/i18n";
import type { BackgroundTheme, CanvasLayout, TextCursor, Theme } from "../../model/preferences";
import Icon from "@/shared/ui/icon";
import Dropdown from "@/shared/ui/dropdown";
import AiChatShortcutInput from "./ai-chat-shortcut-input";
import AiFeaturesToggle from "./ai-features-toggle";
import type { AiChatShortcut } from "../../model/ai-chat-shortcut";
import { styles } from "./style.css.ts";
import BlockSlider from "@/shared/ui/block-slider";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";

type Props = {
	open: boolean;
	aiFeaturesEnabled: boolean;
	gambiarraEnabled: boolean;
	onGambiarraEnabledChange: (value: boolean) => void;
	aiChatShortcut: AiChatShortcut;
	onAiChatShortcutChange: (value: AiChatShortcut) => void;
	aiResetting?: boolean;
	aiCleanupError?: string;
	onAiFeaturesEnabledChange: (value: boolean) => void;
	canvasLayout: CanvasLayout;
	onCanvasLayoutChange: (value: CanvasLayout) => void;
	centerCanvasOnLaunch: boolean;
	hideCanvasControls: boolean;
	language: Language;
	theme: Theme;
	backgroundTheme: BackgroundTheme;
	textCursor: TextCursor;
	soundVolume: number;
	onSoundVolumeChange: (value: number) => void;
	footer?: JSX.Element;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onCenterCanvasChange: (value: boolean) => void;
	onHideCanvasControlsChange: (value: boolean) => void;
	onLanguageChange: (value: Language) => void;
	onThemeChange: (value: Theme) => void;
	onBackgroundThemeChange: (value: BackgroundTheme) => void;
	onTextCursorChange: (value: TextCursor) => void;
};

const SettingsDialog: Component<Props> = (props) => {
	const backdropDismiss = createBackdropDismiss(() => props.onClose());
	return (
	<Show when={props.open}>
		<div
			class={styles.backdrop}
			ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "settings-dialog" })}
			{...backdropDismiss}
		>
			<section class={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="settings-heading">
				<AsciiBackdrop placement="modal" />
				<header class={styles.header}>
					<h2 class={styles.title} id="settings-heading">
						{props.t("settings")}
					</h2>
					<Button class={styles.close} type="button" aria-label={props.t("close")} onClick={props.onClose}>
						<Icon name="close" size={16} />
					</Button>
				</header>
				<label class={styles.option}>
					<span>{props.t("centerCanvasOnLaunch")}</span>
					<Input
						class={styles.toggle}
						type="checkbox"
						checked={props.centerCanvasOnLaunch}
						onChange={(event) => props.onCenterCanvasChange(event.currentTarget.checked)}
					/>
				</label>
				<label class={styles.option}>
					<span>{props.t("hideCanvasControls")}</span>
					<Input
						class={styles.toggle}
						type="checkbox"
						checked={props.hideCanvasControls}
						onChange={(event) => props.onHideCanvasControlsChange(event.currentTarget.checked)}
					/>
				</label>
				<AiFeaturesToggle aiEnabled={props.aiFeaturesEnabled} gambiarraEnabled={props.gambiarraEnabled}
					disabled={props.aiResetting} onAiChange={props.onAiFeaturesEnabledChange}
					onGambiarraChange={props.onGambiarraEnabledChange} t={props.t} />
				<Show when={props.aiFeaturesEnabled || props.gambiarraEnabled}>
					<div class={styles.option}>
						<label for="settings-aiChatShortcut">{props.t("aiChatShortcut")}</label>
						<AiChatShortcutInput value={props.aiChatShortcut} onChange={props.onAiChatShortcutChange} t={props.t} />
					</div>
				</Show>
				<Show when={props.aiCleanupError}>{(error) => <p role="alert" class={styles.error}>{error()}</p>}</Show>
				<div class={styles.option}>
					<label for="settings-canvasLayout">{props.t("canvasLayout")}</label>
					<Dropdown id="settings-canvasLayout" ariaLabel={props.t("canvasLayout")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.canvasLayout}
						options={[{ value: "static", label: props.t("staticCanvas") }, { value: "dynamic", label: props.t("dynamicCanvas") }]}
						onChange={(value) => props.onCanvasLayoutChange(value as CanvasLayout)} />
				</div>
				<div class={styles.option}>
					<label for="settings-language">{props.t("language")}</label>
					<Dropdown id="settings-language" ariaLabel={props.t("language")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.language}
						options={[{ value: "pt-br", label: props.t("languagePtBr") }, { value: "en", label: props.t("languageEn") }]}
						onChange={(value) => props.onLanguageChange(value as Language)} />
				</div>
				<div class={styles.option}>
					<label for="settings-theme">{props.t("theme")}</label>
					<Dropdown id="settings-theme" ariaLabel={props.t("theme")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.theme}
						options={[{ value: "dark", label: props.t("themeDark") }, { value: "light", label: props.t("themeLight") }]}
						onChange={(value) => props.onThemeChange(value as Theme)} />
				</div>
				<div class={styles.option}>
					<label for="settings-backgroundTheme">{props.t("backgroundStyle")}</label>
					<Dropdown id="settings-backgroundTheme" ariaLabel={props.t("backgroundStyle")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.backgroundTheme}
						options={[
							{ value: "default", label: props.t("backgroundStyleDefault") },
							{ value: "constellation", label: props.t("backgroundStyleConstellation") },
							{ value: "matrix", label: props.t("backgroundStyleMatrix") },
						]}
						onChange={(value) => props.onBackgroundThemeChange(value as BackgroundTheme)} />
				</div>
				<div class={styles.option}>
					<label for="settings-textCursor">{props.t("textCursor")}</label>
					<Dropdown id="settings-textCursor" ariaLabel={props.t("textCursor")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.textCursor}
						options={[{ value: "line", label: props.t("textCursorLine") }, { value: "line-static", label: props.t("textCursorLineStatic") }, { value: "terminal", label: props.t("textCursorTerminal") }, { value: "terminal-static", label: props.t("textCursorTerminalStatic") }]}
						onChange={(value) => props.onTextCursorChange(value as TextCursor)} />
				</div>
				<div class={styles.option}>
					<label for="settings-soundVolume">{props.t("soundVolume")}</label>
					<div class={styles.volumeControl}>
						<BlockSlider id="settings-soundVolume" value={props.soundVolume} onChange={props.onSoundVolumeChange} />
					</div>
				</div>
				<footer class={styles.footer}>{props.footer}</footer>
			</section>
		</div>
	</Show>
);
};

export default SettingsDialog;
