import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { Show, type Component, type JSX } from "solid-js";
import type { Language, TranslationKey } from "@/shared/lib/i18n";
import type { CanvasLayout, TextCursor, Theme } from "../../model/preferences";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css.ts";

type Props = {
	open: boolean;
	canvasLayout: CanvasLayout;
	onCanvasLayoutChange: (value: CanvasLayout) => void;
	centerCanvasOnLaunch: boolean;
	hideCanvasControls: boolean;
	language: Language;
	theme: Theme;
	textCursor: TextCursor;
	footer?: JSX.Element;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onCenterCanvasChange: (value: boolean) => void;
	onHideCanvasControlsChange: (value: boolean) => void;
	onLanguageChange: (value: Language) => void;
	onThemeChange: (value: Theme) => void;
	onTextCursorChange: (value: TextCursor) => void;
};

const SettingsDialog: Component<Props> = (props) => (
	<Show when={props.open}>
		<div
			class={styles.backdrop}
			ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "settings-dialog" })}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
		>
			<section class={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="settings-heading">
				<header class={styles.header}>
					<h2 class={styles.title} id="settings-heading">
						{props.t("settings")}
					</h2>
					<button class={styles.close} type="button" aria-label={props.t("close")} onClick={props.onClose}>
						<Icon name="close" size={16} />
					</button>
				</header>
				<label class={styles.option}>
					<span>{props.t("centerCanvasOnLaunch")}</span>
					<input
						class={styles.toggle}
						type="checkbox"
						checked={props.centerCanvasOnLaunch}
						onChange={(event) => props.onCenterCanvasChange(event.currentTarget.checked)}
					/>
				</label>
				<label class={styles.option}>
					<span>{props.t("hideCanvasControls")}</span>
					<input
						class={styles.toggle}
						type="checkbox"
						checked={props.hideCanvasControls}
						onChange={(event) => props.onHideCanvasControlsChange(event.currentTarget.checked)}
					/>
				</label>
				<label class={styles.option}>
					<span>{props.t("canvasLayout")}</span>
					<select class={styles.select} value={props.canvasLayout}
						onChange={(event) => props.onCanvasLayoutChange(event.currentTarget.value as CanvasLayout)}>
						<option value="static">{props.t("staticCanvas")}</option>
						<option value="dynamic">{props.t("dynamicCanvas")}</option>
					</select>
				</label>
				<label class={styles.option}>
					<span>{props.t("language")}</span>
					<select
						class={styles.select}
						value={props.language}
						onChange={(event) => props.onLanguageChange(event.currentTarget.value as Language)}
					>
						<option value="pt-br">{props.t("languagePtBr")}</option>
						<option value="en">{props.t("languageEn")}</option>
					</select>
				</label>
				<label class={styles.option}>
					<span>{props.t("theme")}</span>
					<select
						class={styles.select}
						value={props.theme}
						onChange={(event) => props.onThemeChange(event.currentTarget.value as Theme)}
					>
						<option value="dark">{props.t("themeDark")}</option>
						<option value="light">{props.t("themeLight")}</option>
					</select>
				</label>
				<label class={styles.option}>
					<span>{props.t("textCursor")}</span>
					<select class={styles.select} value={props.textCursor}
						onChange={(event) => props.onTextCursorChange(event.currentTarget.value as TextCursor)}>
						<option value="line">{props.t("textCursorLine")}</option>
						<option value="line-static">{props.t("textCursorLineStatic")}</option>
						<option value="terminal">{props.t("textCursorTerminal")}</option>
						<option value="terminal-static">{props.t("textCursorTerminalStatic")}</option>
					</select>
				</label>
				<footer class={styles.footer}>{props.footer}</footer>
			</section>
		</div>
	</Show>
);

export default SettingsDialog;
