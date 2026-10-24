import { createSignal, onCleanup, onMount } from "solid-js";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import type { TranslationKey } from "@/shared/lib/i18n";
import {
	confirmCloseWithoutSaving,
	closeWindow,
	exitMainApp,
	hideMainWindow,
	isGnomeDesktop,
	isWindowMaximized,
	minimizeWindow,
	onWindowCloseRequested,
	onWindowResized,
	showMainWindow,
	toggleWindowMaximize,
} from "../api/window.repository";

const isLinux = typeof navigator !== "undefined" && navigator.platform.toLowerCase().startsWith("linux");

export const useWindowControls = (beforeClose: () => Promise<boolean>, t: (key: TranslationKey) => string) => {
	const [maximized, setMaximized] = createSignal(false);
	const [gnome, setGnome] = createSignal<boolean | undefined>(isLinux ? undefined : false);
	let unlistenResize: (() => void) | undefined;
	let unlistenClose: (() => void) | undefined;
	let closePending = false;
	let exitAfterClose = false;
	let active = true;

	onMount(() => {
		if (!isDesktopRuntime()) return;
		if (isLinux) {
			void isGnomeDesktop().then(setGnome).catch((error) => {
				console.error(error);
				setGnome(false);
			});
		}
		const syncMaximized = () => {
			void isWindowMaximized().then(setMaximized).catch(console.error);
		};

		syncMaximized();
		void onWindowResized(syncMaximized)
			.then((unlisten) => {
				if (active) unlistenResize = unlisten;
				else unlisten();
			})
			.catch(console.error);

		void onWindowCloseRequested((destroyWindow) => {
			if (closePending) return;
			closePending = true;
			void beforeClose()
				.catch((error) => { console.error(error); return false; })
				.then(async (saved) => {
					if (!saved) {
						const confirmed = await confirmCloseWithoutSaving(t("closeUnsavedMessage"), t("appName"),
							t("closeWithoutSaving"), t("keepEditing"));
						if (!confirmed) {
							exitAfterClose = false;
							closePending = false;
							return;
						}
					}
					try {
						if (exitAfterClose) {
							await exitMainApp();
						} else if (isLinux) {
							await hideMainWindow();
							closePending = false;
						} else {
							await destroyWindow();
						}
					} catch (error) {
						exitAfterClose = false;
						closePending = false;
						console.error(error);
					}
				})
				.catch((error) => {
					exitAfterClose = false;
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
		if (!isDesktopRuntime() || closePending || exitAfterClose) return;
		exitAfterClose = true;
		try {
			await showMainWindow();
			await closeWindow();
		} catch (error) {
			exitAfterClose = false;
			console.error(error);
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
			setMaximized(await isWindowMaximized());
		} catch (error) {
			console.error(error);
		}
	};

	return {
		maximized,
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
