import type { TextCursor, Theme } from "../model/preferences";
import type { Language } from "@/shared/lib/i18n";

const CENTER_CANVAS_KEY = "omega-notes.settings.center-canvas-on-launch";
const HIDE_ZOOM_KEY = "omega-notes.settings.hide-zoom-controls";
const THEME_KEY = "omega-notes.settings.theme";
const LANGUAGE_KEY = "omega-notes.settings.language";
const TEXT_CURSOR_KEY = "omega-notes.settings.text-cursor";

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
export const readHideZoomControls = (): boolean => readBoolean(HIDE_ZOOM_KEY, false);

export const readLanguage = (): Language => {
	try {
		return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "pt-br";
	} catch {
		return "pt-br";
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
export const saveHideZoomControls = (value: boolean): void => writeBoolean(HIDE_ZOOM_KEY, value);

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
