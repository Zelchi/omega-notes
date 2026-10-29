import Button from "@/shared/ui/button";
import Input from "@/shared/ui/input";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { For, Show, Suspense, type Accessor, type Component, type JSX } from "solid-js";
import type { Language, TranslationKey } from "@/shared/lib/i18n";
import type { IconName } from "@/shared/ui/icon";
import type { BackgroundTheme, CanvasLayout, SettingsCategory, TextCursor, Theme } from "../../model/preferences";
import Icon from "@/shared/ui/icon";
import Dropdown from "@/shared/ui/dropdown";
import AiChatShortcutInput from "./ai-chat-shortcut-input";
import KeyboardShortcutInput from "./keyboard-shortcut-input";
import AiFeaturesToggle from "./ai-features-toggle";
import GambiarraWarningDialog from "./gambiarra-warning-dialog";
import type { AiChatShortcut } from "../../model/ai-chat-shortcut";
import type { SearchShortcut } from "../../model/search-shortcut";
import type { CanvasLayoutShortcut } from "../../model/canvas-layout-shortcut";
import type { NoteLockShortcut } from "../../model/note-lock-shortcut";
import { styles } from "./style.css.ts";
import BlockSlider from "@/shared/ui/block-slider";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";

const settingsCategories: { id: SettingsCategory; label: TranslationKey; icon: IconName }[] = [
	{ id: "preferences", label: "settingsCategoryPreferences", icon: "sliders" },
	{ id: "graphics", label: "settingsCategoryGraphics", icon: "display" },
	{ id: "hotkeys", label: "settingsCategoryHotkeys", icon: "keyboard" },
	{ id: "ai", label: "settingsCategoryAi", icon: "chat" },
];

type Props = {
	open: boolean;
	category: Accessor<SettingsCategory>;
	onCategoryChange: (value: SettingsCategory) => void;
	confirmGambiarra: Accessor<boolean>;
	setConfirmGambiarra: (value: boolean) => void;
	aiFeaturesEnabled: boolean;
	gambiarraEnabled: boolean;
	onGambiarraEnabledChange: (value: boolean) => void;
	aiChatShortcut: AiChatShortcut;
	onAiChatShortcutChange: (value: AiChatShortcut) => void;
	searchShortcut: SearchShortcut;
	onSearchShortcutChange: (value: SearchShortcut) => void;
	canvasLayoutShortcut: CanvasLayoutShortcut;
	onCanvasLayoutShortcutChange: (value: CanvasLayoutShortcut) => void;
	noteLockShortcut: NoteLockShortcut;
	onNoteLockShortcutChange: (value: NoteLockShortcut) => void;
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
	backgroundIntensity: number;
	onBackgroundIntensityChange: (value: number) => void;
	versionControl?: () => JSX.Element;
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
	const selectedCategory = () => settingsCategories.find((item) => item.id === props.category())!;
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
						<h2 class={styles.title} id="settings-heading">{props.t("settings")}</h2>
						<Button class={styles.close} type="button" aria-label={props.t("close")} onClick={props.onClose}>
							<Icon name="close" size={16} />
						</Button>
					</header>

					<div class={styles.content} aria-labelledby={`settings-category-${props.category()}`}>
						<h3 class={styles.sectionTitle} id={`settings-category-${props.category()}`}>
							{props.t(selectedCategory().label)}
						</h3>
						<div class={styles.options}>
							<Show when={props.category() === "hotkeys"}>
								<div class={styles.option}>
									<label for="settings-searchShortcut">{props.t("searchFocusShortcut")}</label>
									<KeyboardShortcutInput id="settings-searchShortcut" label="searchFocusShortcut"
										value={props.searchShortcut} onChange={props.onSearchShortcutChange} t={props.t} />
								</div>
								<div class={styles.option}>
									<label for="settings-canvasLayoutShortcut">{props.t("canvasLayoutShortcut")}</label>
									<KeyboardShortcutInput id="settings-canvasLayoutShortcut" label="canvasLayoutShortcut"
										value={props.canvasLayoutShortcut} onChange={props.onCanvasLayoutShortcutChange} t={props.t} />
								</div>
								<div class={styles.option}>
									<label for="settings-noteLockShortcut">{props.t("noteLockShortcut")}</label>
									<KeyboardShortcutInput id="settings-noteLockShortcut" label="noteLockShortcut"
										value={props.noteLockShortcut} onChange={props.onNoteLockShortcutChange} t={props.t} />
								</div>
								<div class={styles.option}>
									<label for="settings-aiChatShortcut">{props.t("aiChatShortcut")}</label>
									<AiChatShortcutInput value={props.aiChatShortcut} onChange={props.onAiChatShortcutChange} t={props.t} />
								</div>
							</Show>

							<Show when={props.category() === "graphics"}>
								<label class={styles.option}>
									<span>{props.t("centerCanvasOnLaunch")}</span>
									<Input class={styles.toggle} type="checkbox" checked={props.centerCanvasOnLaunch}
										onChange={(event) => props.onCenterCanvasChange(event.currentTarget.checked)} />
								</label>
								<label class={styles.option}>
									<span>{props.t("hideCanvasControls")}</span>
									<Input class={styles.toggle} type="checkbox" checked={props.hideCanvasControls}
										onChange={(event) => props.onHideCanvasControlsChange(event.currentTarget.checked)} />
								</label>
								<div class={styles.option}>
									<label for="settings-canvasLayout">{props.t("canvasLayout")}</label>
									<Dropdown id="settings-canvasLayout" ariaLabel={props.t("canvasLayout")}
										style={{ width: "160px", "max-width": "55%", "flex-shrink": 0 }} value={props.canvasLayout}
										options={[
											{ value: "static", label: props.t("staticCanvas") },
											{ value: "dynamic", label: props.t("dynamicCanvas") },
										]}
										onChange={(value) => props.onCanvasLayoutChange(value as CanvasLayout)} />
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
									<label for="settings-backgroundIntensity">{props.t("backgroundIntensity")}</label>
									<div class={styles.volumeControl}>
										<BlockSlider id="settings-backgroundIntensity" value={props.backgroundIntensity} onChange={props.onBackgroundIntensityChange} />
									</div>
								</div>
							</Show>

							<Show when={props.category() === "preferences"}>
								<Suspense fallback={null}>{props.versionControl?.()}</Suspense>
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
										options={[
											{ value: "line", label: props.t("textCursorLine") },
											{ value: "line-static", label: props.t("textCursorLineStatic") },
											{ value: "terminal", label: props.t("textCursorTerminal") },
											{ value: "terminal-static", label: props.t("textCursorTerminalStatic") },
										]}
										onChange={(value) => props.onTextCursorChange(value as TextCursor)} />
								</div>
								<div class={styles.option}>
									<label for="settings-soundVolume">{props.t("soundVolume")}</label>
									<div class={styles.volumeControl}>
										<BlockSlider id="settings-soundVolume" value={props.soundVolume} onChange={props.onSoundVolumeChange} />
									</div>
								</div>
							</Show>

							<Show when={props.category() === "ai"}>
								<AiFeaturesToggle aiEnabled={props.aiFeaturesEnabled} disabled={props.aiResetting}
									onAiChange={props.onAiFeaturesEnabledChange} t={props.t} />
								<label class={styles.option}>
									<span>{props.t("gambiarra")}</span>
									<Input class={styles.toggle} type="checkbox" checked={props.gambiarraEnabled}
										disabled={props.aiFeaturesEnabled || props.aiResetting}
										onChange={(event) => {
											if (event.currentTarget.checked) {
												event.currentTarget.checked = false;
												props.setConfirmGambiarra(true);
											} else props.onGambiarraEnabledChange(false);
										}} />
								</label>
								<Show when={props.aiCleanupError}>{(error) => <p role="alert" class={styles.error}>{error()}</p>}</Show>
							</Show>
						</div>
					</div>

					<footer class={styles.footer}>
						<nav class={styles.categoryNav} aria-label={props.t("settings")}>
							<For each={settingsCategories}>{(item) => (
								<Button class={styles.categoryButton} type="button" aria-pressed={props.category() === item.id}
									onClick={() => props.onCategoryChange(item.id)}>
									<Icon name={item.icon} size={17} />
									<span>{props.t(item.label)}</span>
								</Button>
							)}</For>
						</nav>
					</footer>
				</section>
				<Show when={props.confirmGambiarra()}>
					<GambiarraWarningDialog t={props.t} onCancel={() => props.setConfirmGambiarra(false)} onConfirm={() => {
						props.onGambiarraEnabledChange(true);
						props.setConfirmGambiarra(false);
					}} />
				</Show>
			</div>
		</Show>
	);
};

export default SettingsDialog;
