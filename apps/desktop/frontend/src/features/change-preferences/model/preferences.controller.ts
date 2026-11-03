import { createSignal } from "solid-js";
import { setSoundVolume as applySoundVolume } from "@/shared/ui/sound";
import type { Language } from "@/shared/lib/i18n";
import type { BackgroundTheme, CanvasLayout, TextCursor, Theme } from "./preferences";
import { hasKeyboardShortcutConflict, isAiChatShortcut, isKeyboardShortcut, resolveShortcutConflicts, type AiChatShortcut, type KeyboardShortcut } from "./ai-chat-shortcut";
import { isSearchShortcut, type SearchShortcut } from "./search-shortcut";
import { isCanvasLayoutShortcut, type CanvasLayoutShortcut } from "./canvas-layout-shortcut";
import { isNoteLockShortcut, type NoteLockShortcut } from "./note-lock-shortcut";
import {
	readAiFeaturesEnabled,
	readGambiarraEnabled,
	saveGambiarraEnabled,
	readSoundVolume,
	saveSoundVolume,
	readAiChatShortcut,
	saveAiChatShortcut,
	readPomodoroShortcut,
	savePomodoroShortcut,
	readKanbanShortcut,
	saveKanbanShortcut,
	readSearchShortcut,
	readCanvasLayoutShortcut,
	saveSearchShortcut,
	saveCanvasLayoutShortcut,
	readNoteLockShortcut,
	saveNoteLockShortcut,
	saveAiFeaturesEnabled,
	readCanvasLayout,
	readBackgroundTheme,
	readBackgroundIntensity,
	readCenterCanvasOnLaunch,
	readHideCanvasControls,
	readLanguage,
	readTheme,
	readTextCursor,
	saveCanvasLayout,
	saveBackgroundTheme,
	saveBackgroundIntensity,
	saveCenterCanvasOnLaunch,
	saveHideCanvasControls,
	saveLanguage,
	saveTheme,
	saveTextCursor,
} from "../api/preferences.repository";

export const usePreferences = () => {
	const savedShortcuts = {
		aiChat: readAiChatShortcut(),
		pomodoro: readPomodoroShortcut(),
		kanban: readKanbanShortcut(),
		search: readSearchShortcut(),
		canvasLayout: readCanvasLayoutShortcut(),
		noteLock: readNoteLockShortcut(),
	};
	const shortcuts = resolveShortcutConflicts(savedShortcuts);
	if (JSON.stringify(savedShortcuts.aiChat) !== JSON.stringify(shortcuts.aiChat)) saveAiChatShortcut(shortcuts.aiChat as AiChatShortcut);
	if (JSON.stringify(savedShortcuts.pomodoro) !== JSON.stringify(shortcuts.pomodoro)) savePomodoroShortcut(shortcuts.pomodoro);
	if (JSON.stringify(savedShortcuts.kanban) !== JSON.stringify(shortcuts.kanban)) saveKanbanShortcut(shortcuts.kanban);
	if (JSON.stringify(savedShortcuts.search) !== JSON.stringify(shortcuts.search)) saveSearchShortcut(shortcuts.search);
	if (JSON.stringify(savedShortcuts.canvasLayout) !== JSON.stringify(shortcuts.canvasLayout)) saveCanvasLayoutShortcut(shortcuts.canvasLayout);
	if (JSON.stringify(savedShortcuts.noteLock) !== JSON.stringify(shortcuts.noteLock)) saveNoteLockShortcut(shortcuts.noteLock);
	const [soundVolume, setSoundVolume] = createSignal(readSoundVolume());
	applySoundVolume(soundVolume());
	const [aiFeaturesEnabled, setAiFeaturesEnabled] = createSignal(readAiFeaturesEnabled());
	const [gambiarraEnabled, setGambiarraEnabled] = createSignal(!aiFeaturesEnabled() && readGambiarraEnabled());
	const [aiChatShortcut, setAiChatShortcut] = createSignal(shortcuts.aiChat);
	const [pomodoroShortcut, setPomodoroShortcut] = createSignal(shortcuts.pomodoro);
	const [kanbanShortcut, setKanbanShortcut] = createSignal(shortcuts.kanban);
	const [searchShortcut, setSearchShortcut] = createSignal(shortcuts.search);
	const [canvasLayoutShortcut, setCanvasLayoutShortcut] = createSignal(shortcuts.canvasLayout);
	const [noteLockShortcut, setNoteLockShortcut] = createSignal(shortcuts.noteLock);
	const [canvasLayout, setCanvasLayout] = createSignal<CanvasLayout>(readCanvasLayout());
	const [centerCanvasOnLaunch, setCenterCanvasOnLaunch] = createSignal(readCenterCanvasOnLaunch());
	const [hideCanvasControls, setHideCanvasControls] = createSignal(readHideCanvasControls());
	const [language, setLanguage] = createSignal<Language>(readLanguage());
	const [theme, setTheme] = createSignal<Theme>(readTheme());
	const [backgroundTheme, setBackgroundTheme] = createSignal<BackgroundTheme>(readBackgroundTheme());
	const [backgroundIntensity, setBackgroundIntensity] = createSignal(readBackgroundIntensity());
	const [textCursor, setTextCursor] = createSignal<TextCursor>(readTextCursor());

	document.documentElement.dataset.theme = theme();
	document.documentElement.style.colorScheme = theme();
	document.documentElement.dataset.textCursor = textCursor();

	const updateLanguage = (value: Language): void => {
		setLanguage(value);
		saveLanguage(value);
	};

	const updateTheme = (value: Theme): void => {
		document.documentElement.dataset.theme = value;
		document.documentElement.style.colorScheme = value;
		setTheme(value);
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
		pomodoroShortcut,
		setPomodoroShortcut: (value: KeyboardShortcut) => {
			if (!isKeyboardShortcut(value) || hasKeyboardShortcutConflict(value, [
				kanbanShortcut(), searchShortcut(), canvasLayoutShortcut(), noteLockShortcut(), aiChatShortcut(),
			])) return false;
			setPomodoroShortcut(value);
			savePomodoroShortcut(value);
			return true;
		},
		kanbanShortcut,
		setKanbanShortcut: (value: KeyboardShortcut) => {
			if (!isKeyboardShortcut(value) || hasKeyboardShortcutConflict(value, [
				pomodoroShortcut(), searchShortcut(), canvasLayoutShortcut(), noteLockShortcut(), aiChatShortcut(),
			])) return false;
			setKanbanShortcut(value);
			saveKanbanShortcut(value);
			return true;
		},
		searchShortcut,
		setAiChatShortcut: (value: AiChatShortcut) => {
			if (!isAiChatShortcut(value) || hasKeyboardShortcutConflict(value, [
				pomodoroShortcut(), kanbanShortcut(), searchShortcut(), canvasLayoutShortcut(), noteLockShortcut(),
			])) return false;
			setAiChatShortcut(value);
			saveAiChatShortcut(value);
			return true;
		},
		setSearchShortcut: (value: SearchShortcut) => {
			if (!isSearchShortcut(value) || hasKeyboardShortcutConflict(value, [
				pomodoroShortcut(), kanbanShortcut(), canvasLayoutShortcut(), noteLockShortcut(), aiChatShortcut(),
			])) return false;
			setSearchShortcut(value);
			saveSearchShortcut(value);
			return true;
		},
		canvasLayoutShortcut,
		setCanvasLayoutShortcut: (value: CanvasLayoutShortcut) => {
			if (!isCanvasLayoutShortcut(value) || hasKeyboardShortcutConflict(value, [
				pomodoroShortcut(), kanbanShortcut(), searchShortcut(), noteLockShortcut(), aiChatShortcut(),
			])) return false;
			setCanvasLayoutShortcut(value);
			saveCanvasLayoutShortcut(value);
			return true;
		},
		noteLockShortcut,
		setNoteLockShortcut: (value: NoteLockShortcut) => {
			if (!isNoteLockShortcut(value) || hasKeyboardShortcutConflict(value, [
				pomodoroShortcut(), kanbanShortcut(), searchShortcut(), canvasLayoutShortcut(), aiChatShortcut(),
			])) return false;
			setNoteLockShortcut(value);
			saveNoteLockShortcut(value);
			return true;
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
		backgroundIntensity,
		setBackgroundIntensity: (value: number) => {
			if (!Number.isFinite(value)) return;
			const intensity = Math.max(0, Math.min(1, value));
			setBackgroundIntensity(intensity);
			saveBackgroundIntensity(intensity);
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
