import { createSignal, onCleanup, onMount } from "solid-js";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import type { TranslationKey } from "@/shared/lib/i18n";
import { occupiesWindowAxis } from "./window-axis";
import {
	confirmCloseWithoutSaving,
	exitMainApp,
	getWindowAxisSizes,
	hideMainWindow,
	isGnomeDesktop,
	isWindowMaximized,
	minimizeWindow,
	onWindowCloseRequested,
	onWindowResized,
	toggleWindowMaximize,
} from "../api/window.repository";

const isLinux = typeof navigator !== "undefined" && navigator.platform.toLowerCase().startsWith("linux");

export const useWindowControls = (beforeClose: () => Promise<boolean>, t: (key: TranslationKey) => string) => {
	const [maximized, setMaximized] = createSignal(false);
	const [squareCorners, setSquareCorners] = createSignal(false);
	const [gnome, setGnome] = createSignal<boolean | undefined>(isLinux ? undefined : false);
	let unlistenResize: (() => void) | undefined;
	let unlistenClose: (() => void) | undefined;
	let closePending = false;
	let active = true;
	let maximizeQuery = 0;
	const syncMaximized = () => {
		const query = ++maximizeQuery;
		void Promise.all([isWindowMaximized(), getWindowAxisSizes().catch((error) => { console.error(error); return null; })]).then(([value, sizes]) => {
			if (active && query === maximizeQuery) {
				setMaximized(value);
				setSquareCorners(value || occupiesWindowAxis(sizes, isLinux));
			}
		}).catch(console.error);
	};
	const confirmClose = async () => {
		const saved = await beforeClose().catch((error) => { console.error(error); return false; });
		return saved || confirmCloseWithoutSaving(t("closeUnsavedMessage"), t("appName"),
			t("closeWithoutSaving"), t("keepEditing"));
	};

	onMount(() => {
		if (!isDesktopRuntime()) return;
		if (isLinux) {
			void isGnomeDesktop().then(setGnome).catch((error) => {
				console.error(error);
				setGnome(false);
			});
		}
		void onWindowResized(syncMaximized)
			.then((unlisten) => {
				if (active) {
					unlistenResize = unlisten;
					syncMaximized();
				}
				else unlisten();
			})
			.catch(console.error);

		void onWindowCloseRequested((destroyWindow) => {
			if (closePending) return;
			closePending = true;
			void confirmClose()
				.catch((error) => { console.error(error); return false; })
				.then(async (confirmed) => {
					if (!confirmed) {
						closePending = false;
						return;
					}
					try {
						if (isLinux) {
							await hideMainWindow();
							closePending = false;
						} else {
							await destroyWindow();
						}
					} catch (error) {
						closePending = false;
						console.error(error);
					}
				})
				.catch((error) => {
					closePending = false;
					console.error(error);
				});
		})
			.then((unlisten) => {
				if (active) unlistenClose = unlisten;
				else unlisten();
			})
			.catch(console.error);
	});

	const exit = async (): Promise<void> => {
		if (!isDesktopRuntime() || closePending) return;
		closePending = true;
		try {
			await beforeClose();
		} catch (error) {
			console.error(error);
		}
		try {
			await exitMainApp();
		} catch (error) {
			console.error(error);
		} finally {
			closePending = false;
		}
	};

	onCleanup(() => {
		active = false;
		unlistenResize?.();
		unlistenClose?.();
	});

	const toggleMaximize = async (): Promise<void> => {
		if (!isDesktopRuntime()) return;
		try {
			await toggleWindowMaximize();
			syncMaximized();
		} catch (error) {
			console.error(error);
		}
	};

	return {
		maximized,
		squareCorners,
		gnome,
		minimize: () => {
			if (isDesktopRuntime()) void minimizeWindow().catch(console.error);
		},
		toggleMaximize,
		exit,
		close: () => {
			if (isDesktopRuntime()) void hideMainWindow().catch(console.error);
		},
	};
};
