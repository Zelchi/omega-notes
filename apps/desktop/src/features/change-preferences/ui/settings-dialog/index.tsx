import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { Show, type Component, type JSX } from "solid-js";
import type { Language, TranslationKey } from "@/shared/lib/i18n";
import type { CanvasLayout, TextCursor, Theme } from "../../model/preferences";
import Icon from "@/shared/ui/icon";
import Dropdown from "@/shared/ui/dropdown";
import { styles } from "./style.css.ts";

type Props = {
	open: boolean;
	aiFeaturesEnabled: boolean;
	aiResetting?: boolean;
	aiCleanupError?: string;
	onAiFeaturesEnabledChange: (value: boolean) => void;
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
					<span>{props.t("aiFeatures")}</span>
					<input class={styles.toggle} type="checkbox" checked={props.aiFeaturesEnabled} disabled={props.aiResetting}
						onChange={(event) => props.onAiFeaturesEnabledChange(event.currentTarget.checked)} />
				</label>
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
					<label for="settings-textCursor">{props.t("textCursor")}</label>
					<Dropdown id="settings-textCursor" ariaLabel={props.t("textCursor")}
						style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.textCursor}
						options={[{ value: "line", label: props.t("textCursorLine") }, { value: "line-static", label: props.t("textCursorLineStatic") }, { value: "terminal", label: props.t("textCursorTerminal") }, { value: "terminal-static", label: props.t("textCursorTerminalStatic") }]}
						onChange={(value) => props.onTextCursorChange(value as TextCursor)} />
				</div>
				<footer class={styles.footer}>{props.footer}</footer>
			</section>
		</div>
	</Show>
);

export default SettingsDialog;
