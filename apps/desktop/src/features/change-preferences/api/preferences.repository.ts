import type { BackgroundTheme, CanvasLayout, NoteMode, TextCursor, Theme } from "../model/preferences";
import type { Language } from "@/shared/lib/i18n";
import { DEFAULT_AI_CHAT_SHORTCUT, isAiChatShortcut, type AiChatShortcut } from "../model/ai-chat-shortcut";
import { DEFAULT_SEARCH_SHORTCUT, isSearchShortcut, type SearchShortcut } from "../model/search-shortcut";
import { DEFAULT_CANVAS_LAYOUT_SHORTCUT, isCanvasLayoutShortcut, type CanvasLayoutShortcut } from "../model/canvas-layout-shortcut";

const CENTER_CANVAS_KEY = "omega-notes.settings.center-canvas-on-launch";
const HIDE_CANVAS_CONTROLS_KEY = "omega-notes.settings.hide-zoom-controls";
const THEME_KEY = "omega-notes.settings.theme";
const BACKGROUND_THEME_KEY = "omega-notes.settings.background-theme";
const LANGUAGE_KEY = "omega-notes.settings.language";
const TEXT_CURSOR_KEY = "omega-notes.settings.text-cursor";
const AI_FEATURES_KEY = "omega-notes.settings.ai-features-enabled";
const GAMBIARRA_KEY = "omega-notes.settings.gambiarra-enabled";
const AI_CHAT_SHORTCUT_KEY = "omega-notes.settings.ai-chat-shortcut";
const SEARCH_SHORTCUT_KEY = "omega-notes.settings.search-shortcut";
const CANVAS_LAYOUT_SHORTCUT_KEY = "omega-notes.settings.canvas-layout-shortcut";
const SOUND_VOLUME_KEY = "omega-notes.settings.sound-volume";
const NOTE_MODE_KEY = "omega-notes.settings.note-mode";

export const readSoundVolume = (): number => {
    try {
        const stored = localStorage.getItem(SOUND_VOLUME_KEY);
        if (stored === null || stored.trim() === "") return 1;
        const value = Number(stored);
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    } catch { return 1; }
};

export const saveSoundVolume = (value: number): void => {
    try { localStorage.setItem(SOUND_VOLUME_KEY, String(value)); }
    catch (error) { console.error(error); }
};

export const readAiChatShortcut = (): AiChatShortcut => {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(AI_CHAT_SHORTCUT_KEY) ?? "null");
        return isAiChatShortcut(value) ? value : { ...DEFAULT_AI_CHAT_SHORTCUT };
    } catch { return { ...DEFAULT_AI_CHAT_SHORTCUT }; }
};

export const saveAiChatShortcut = (value: AiChatShortcut): void => {
    try { localStorage.setItem(AI_CHAT_SHORTCUT_KEY, JSON.stringify(value)); }
    catch (error) { console.error(error); }
};

export const readSearchShortcut = (): SearchShortcut => {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(SEARCH_SHORTCUT_KEY) ?? "null");
        return isSearchShortcut(value) ? value : { ...DEFAULT_SEARCH_SHORTCUT };
    } catch { return { ...DEFAULT_SEARCH_SHORTCUT }; }
};

export const saveSearchShortcut = (value: SearchShortcut): void => {
    try { localStorage.setItem(SEARCH_SHORTCUT_KEY, JSON.stringify(value)); }
    catch (error) { console.error(error); }
};

export const readCanvasLayoutShortcut = (): CanvasLayoutShortcut => {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(CANVAS_LAYOUT_SHORTCUT_KEY) ?? "null");
		return isCanvasLayoutShortcut(value) ? value : { ...DEFAULT_CANVAS_LAYOUT_SHORTCUT };
	} catch { return { ...DEFAULT_CANVAS_LAYOUT_SHORTCUT }; }
};

export const saveCanvasLayoutShortcut = (value: CanvasLayoutShortcut): void => {
	try { localStorage.setItem(CANVAS_LAYOUT_SHORTCUT_KEY, JSON.stringify(value)); }
	catch (error) { console.error(error); }
};

export const readTextCursor = (): TextCursor => {
	try {
		const value = localStorage.getItem(TEXT_CURSOR_KEY);
		return value === "terminal" || value === "line-static" || value === "terminal-static" ? value : "line";
	}
	catch { return "line"; }
};

export const saveTextCursor = (value: TextCursor): void => {
	try { localStorage.setItem(TEXT_CURSOR_KEY, value); }
	catch (error) { console.error(error); }
};

const readBoolean = (key: string, fallback: boolean): boolean => {
	try {
		const value = localStorage.getItem(key);
		return value === null ? fallback : value === "true";
	} catch {
		return fallback;
	}
};

const writeBoolean = (key: string, value: boolean): void => {
	try {
		localStorage.setItem(key, String(value));
	} catch (error) {
		console.error(error);
	}
};

export const readCenterCanvasOnLaunch = (): boolean => readBoolean(CENTER_CANVAS_KEY, true);
export const readHideCanvasControls = (): boolean => readBoolean(HIDE_CANVAS_CONTROLS_KEY, false);
export const readAiFeaturesEnabled = (): boolean => readBoolean(AI_FEATURES_KEY, false);
export const saveAiFeaturesEnabled = (value: boolean): void => writeBoolean(AI_FEATURES_KEY, value);
export const readGambiarraEnabled = (): boolean => readBoolean(GAMBIARRA_KEY, false);
export const saveGambiarraEnabled = (value: boolean): void => writeBoolean(GAMBIARRA_KEY, value);

export const readLanguage = (): Language => {
	try {
		return localStorage.getItem(LANGUAGE_KEY) === "pt-br" ? "pt-br" : "en";
	} catch {
		return "en";
	}
};

export const saveLanguage = (language: Language): void => {
	try {
		localStorage.setItem(LANGUAGE_KEY, language);
	} catch {
		console.log("The interface remains usable if browser storage is unavailable.");
	}
};

export const saveCenterCanvasOnLaunch = (value: boolean): void => writeBoolean(CENTER_CANVAS_KEY, value);
export const saveHideCanvasControls = (value: boolean): void => writeBoolean(HIDE_CANVAS_CONTROLS_KEY, value);

export const readTheme = (): Theme => {
	try {
		return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
};

export const saveTheme = (value: Theme): void => {
	try {
		localStorage.setItem(THEME_KEY, value);
	} catch (error) {
		console.error(error);
	}
};

export const readBackgroundTheme = (): BackgroundTheme => {
	try {
		const value = localStorage.getItem(BACKGROUND_THEME_KEY);
		return value === "constellation" || value === "matrix" ? value : "default";
	} catch {
		return "default";
	}
};

export const saveBackgroundTheme = (value: BackgroundTheme): void => {
	try {
		localStorage.setItem(BACKGROUND_THEME_KEY, value);
	} catch (error) {
		console.error(error);
	}
};

export const readCanvasLayout = (): CanvasLayout => {
	try {
		const value = localStorage.getItem("omega-notes.canvas-layout");
		if (value === "archive") return import.meta.env.DEV ? "archive" : "dynamic";
		return value === "static" ? "static" : "dynamic";
	}
	catch { return "static"; }
};

export const saveCanvasLayout = (layout: CanvasLayout): void => {
	try { localStorage.setItem("omega-notes.canvas-layout", layout === "archive" && !import.meta.env.DEV ? "dynamic" : layout); }
	catch { /* The layout can still be switched when storage is unavailable. */ }
};

export const readNoteMode = (): NoteMode => {
	try { return localStorage.getItem(NOTE_MODE_KEY) === "view" ? "view" : "edit"; }
	catch { return "edit"; }
};

export const saveNoteMode = (value: NoteMode): void => {
	try { localStorage.setItem(NOTE_MODE_KEY, value); }
	catch (error) { console.error(error); }
};
