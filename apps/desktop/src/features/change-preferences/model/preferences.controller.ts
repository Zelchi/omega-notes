import { createSignal } from "solid-js";
import { setSoundVolume as applySoundVolume } from "@/shared/ui/sound";
import type { Language } from "@/shared/lib/i18n";
import type { CanvasLayout, TextCursor, Theme } from "./preferences";
import { isAiChatShortcut, type AiChatShortcut } from "./ai-chat-shortcut";
import {
	readAiFeaturesEnabled,
	readGambiarraEnabled,
	saveGambiarraEnabled,
	readSoundVolume,
	saveSoundVolume,
	readAiChatShortcut,
	saveAiChatShortcut,
	saveAiFeaturesEnabled,
	readCanvasLayout,
	readCenterCanvasOnLaunch,
	readHideCanvasControls,
	readLanguage,
	readTheme,
	readTextCursor,
	saveCanvasLayout,
	saveCenterCanvasOnLaunch,
	saveHideCanvasControls,
	saveLanguage,
	saveTheme,
	saveTextCursor,
} from "../api/preferences.repository";

export const usePreferences = () => {
	const [soundVolume, setSoundVolume] = createSignal(readSoundVolume());
	applySoundVolume(soundVolume());
	const [aiFeaturesEnabled, setAiFeaturesEnabled] = createSignal(readAiFeaturesEnabled());
	const [gambiarraEnabled, setGambiarraEnabled] = createSignal(!aiFeaturesEnabled() && readGambiarraEnabled());
	const [aiChatShortcut, setAiChatShortcut] = createSignal(readAiChatShortcut());
	const [canvasLayout, setCanvasLayout] = createSignal<CanvasLayout>(readCanvasLayout());
	const [centerCanvasOnLaunch, setCenterCanvasOnLaunch] = createSignal(readCenterCanvasOnLaunch());
	const [hideCanvasControls, setHideCanvasControls] = createSignal(readHideCanvasControls());
	const [language, setLanguage] = createSignal<Language>(readLanguage());
	const [theme, setTheme] = createSignal<Theme>(readTheme());
	const [textCursor, setTextCursor] = createSignal<TextCursor>(readTextCursor());

	document.documentElement.dataset.theme = theme();
	document.documentElement.style.colorScheme = theme();
	document.documentElement.dataset.textCursor = textCursor();

	const updateLanguage = (value: Language): void => {
		setLanguage(value);
		saveLanguage(value);
	};

	const updateTheme = (value: Theme): void => {
		setTheme(value);
		document.documentElement.dataset.theme = value;
		document.documentElement.style.colorScheme = value;
		saveTheme(value);
	};

	return {
		soundVolume,
		setSoundVolume: (value: number) => {
			if (!Number.isFinite(value)) return;
			const volume = Math.max(0, Math.min(1, value));
			setSoundVolume(volume);
			applySoundVolume(volume);
			saveSoundVolume(volume);
		},
		aiFeaturesEnabled,
		gambiarraEnabled,
		aiChatShortcut,
		setAiChatShortcut: (value: AiChatShortcut) => {
			if (!isAiChatShortcut(value)) return;
			setAiChatShortcut(value);
			saveAiChatShortcut(value);
		},
		setAiFeaturesEnabled: (value: boolean) => {
			if (value) { setGambiarraEnabled(false); saveGambiarraEnabled(false); }
			setAiFeaturesEnabled(value); saveAiFeaturesEnabled(value);
		},
		setGambiarraEnabled: (value: boolean) => {
			if (value && aiFeaturesEnabled()) return;
			setGambiarraEnabled(value); saveGambiarraEnabled(value);
		},
		canvasLayout,
		setCanvasLayout: (value: CanvasLayout) => { setCanvasLayout(value); saveCanvasLayout(value); },
		centerCanvasOnLaunch,
		hideCanvasControls,
		language,
		theme,
		textCursor,
		setTextCursor: (value: TextCursor) => {
			setTextCursor(value);
			document.documentElement.dataset.textCursor = value;
			saveTextCursor(value);
		},
		setCenterCanvasOnLaunch: (value: boolean) => {
			setCenterCanvasOnLaunch(value);
			saveCenterCanvasOnLaunch(value);
		},
		setHideCanvasControls: (value: boolean) => {
			setHideCanvasControls(value);
			saveHideCanvasControls(value);
		},
		setLanguage: updateLanguage,
		setTheme: updateTheme,
	};
};
