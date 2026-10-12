import { createSignal } from "solid-js";
import type { Language } from "@/shared/lib/i18n";
import type { TextCursor, Theme } from "./preferences";
import {
	readCenterCanvasOnLaunch,
	readHideZoomControls,
	readLanguage,
	readTheme,
	readTextCursor,
	saveCenterCanvasOnLaunch,
	saveHideZoomControls,
	saveLanguage,
	saveTheme,
	saveTextCursor,
} from "../api/preferences.repository";

export const usePreferences = () => {
	const [centerCanvasOnLaunch, setCenterCanvasOnLaunch] = createSignal(readCenterCanvasOnLaunch());
	const [hideZoomControls, setHideZoomControls] = createSignal(readHideZoomControls());
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
		centerCanvasOnLaunch,
		hideZoomControls,
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
		setHideZoomControls: (value: boolean) => {
			setHideZoomControls(value);
			saveHideZoomControls(value);
		},
		setLanguage: updateLanguage,
		setTheme: updateTheme,
	};
};
