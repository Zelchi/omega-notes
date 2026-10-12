import { createSignal, onCleanup, onMount } from "solid-js";
import { isTauriRuntime } from "@/shared/lib/tauri";
import {
	closeWindow,
	isWindowMaximized,
	minimizeWindow,
	onWindowCloseRequested,
	onWindowResized,
	toggleWindowMaximize,
} from "../api/window.repository";

export const useWindowControls = (beforeClose: () => Promise<boolean>) => {
	const [maximized, setMaximized] = createSignal(false);
	let unlistenResize: (() => void) | undefined;
	let unlistenClose: (() => void) | undefined;
	let closePending = false;
	let active = true;

	onMount(() => {
		if (!isTauriRuntime()) return;
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
				.then(async (saved) => {
					if (!saved) {
						closePending = false;
						return;
					}
					try {
						await destroyWindow();
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

	onCleanup(() => {
		active = false;
		unlistenResize?.();
		unlistenClose?.();
	});

	const toggleMaximize = async (): Promise<void> => {
		if (!isTauriRuntime()) return;
		try {
			await toggleWindowMaximize();
			setMaximized(await isWindowMaximized());
		} catch (error) {
			console.error(error);
		}
	};

	return {
		maximized,
		minimize: () => {
			if (isTauriRuntime()) void minimizeWindow().catch(console.error);
		},
		toggleMaximize,
		close: () => {
			if (isTauriRuntime()) void closeWindow().catch(console.error);
		},
	};
};
