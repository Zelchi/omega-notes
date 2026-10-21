import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";

export const confirmCloseWithoutSaving = (message: string, title: string, closeLabel: string, cancelLabel: string): Promise<boolean> =>
	confirm(message, { title, kind: "warning", okLabel: closeLabel, cancelLabel });

export const isWindowMaximized = (): Promise<boolean> => getCurrentWindow().isMaximized();

export const onWindowResized = (listener: () => void) => getCurrentWindow().onResized(listener);

export const onWindowCloseRequested = (requestClose: (destroyWindow: () => Promise<void>) => void) => {
	const appWindow = getCurrentWindow();
	return appWindow.onCloseRequested((event) => {
		event.preventDefault();
		requestClose(() => appWindow.destroy());
	});
};

export const toggleWindowMaximize = (): Promise<void> => getCurrentWindow().toggleMaximize();
export const minimizeWindow = (): Promise<void> => getCurrentWindow().minimize();
export const closeWindow = (): Promise<void> => getCurrentWindow().close();
export const hideMainWindow = (): Promise<void> => invoke("hide_main_window");
