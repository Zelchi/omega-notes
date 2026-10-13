import { createSignal } from "solid-js";
import type { Language } from "@/shared/lib/i18n";
import type { CanvasLayout, TextCursor, Theme } from "./preferences";
import {
	readAiFeaturesEnabled,
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
	const [aiFeaturesEnabled, setAiFeaturesEnabled] = createSignal(readAiFeaturesEnabled());
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
		aiFeaturesEnabled,
		setAiFeaturesEnabled: (value: boolean) => { setAiFeaturesEnabled(value); saveAiFeaturesEnabled(value); },
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
