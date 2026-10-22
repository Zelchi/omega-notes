import { createSignal } from "solid-js";
import { setSoundVolume as applySoundVolume } from "@/shared/ui/sound";
import type { Language } from "@/shared/lib/i18n";
import type { BackgroundTheme, CanvasLayout, TextCursor, Theme } from "./preferences";
import { isAiChatShortcut, type AiChatShortcut } from "./ai-chat-shortcut";
import { isSearchShortcut, type SearchShortcut } from "./search-shortcut";
import { isCanvasLayoutShortcut, type CanvasLayoutShortcut } from "./canvas-layout-shortcut";
import {
	readAiFeaturesEnabled,
	readGambiarraEnabled,
	saveGambiarraEnabled,
	readSoundVolume,
	saveSoundVolume,
	readAiChatShortcut,
	saveAiChatShortcut,
	readSearchShortcut,
	readCanvasLayoutShortcut,
	saveSearchShortcut,
	saveCanvasLayoutShortcut,
	saveAiFeaturesEnabled,
	readCanvasLayout,
	readBackgroundTheme,
	readCenterCanvasOnLaunch,
	readHideCanvasControls,
	readLanguage,
	readTheme,
	readTextCursor,
	saveCanvasLayout,
	saveBackgroundTheme,
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
	const [searchShortcut, setSearchShortcut] = createSignal(readSearchShortcut());
	const [canvasLayoutShortcut, setCanvasLayoutShortcut] = createSignal(readCanvasLayoutShortcut());
	const [canvasLayout, setCanvasLayout] = createSignal<CanvasLayout>(readCanvasLayout());
	const [centerCanvasOnLaunch, setCenterCanvasOnLaunch] = createSignal(readCenterCanvasOnLaunch());
	const [hideCanvasControls, setHideCanvasControls] = createSignal(readHideCanvasControls());
	const [language, setLanguage] = createSignal<Language>(readLanguage());
	const [theme, setTheme] = createSignal<Theme>(readTheme());
	const [backgroundTheme, setBackgroundTheme] = createSignal<BackgroundTheme>(readBackgroundTheme());
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
		searchShortcut,
		setAiChatShortcut: (value: AiChatShortcut) => {
			if (!isAiChatShortcut(value)) return;
			setAiChatShortcut(value);
			saveAiChatShortcut(value);
		},
		setSearchShortcut: (value: SearchShortcut) => {
			if (!isSearchShortcut(value)) return;
			setSearchShortcut(value);
			saveSearchShortcut(value);
		},
		canvasLayoutShortcut,
		setCanvasLayoutShortcut: (value: CanvasLayoutShortcut) => {
			if (!isCanvasLayoutShortcut(value)) return;
			setCanvasLayoutShortcut(value);
			saveCanvasLayoutShortcut(value);
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
		backgroundTheme,
		setBackgroundTheme: (value: BackgroundTheme) => {
			setBackgroundTheme(value);
			saveBackgroundTheme(value);
		},
		setCanvasLayout: (value: CanvasLayout) => {
			setCanvasLayout(value);
			saveCanvasLayout(value);
		},
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
