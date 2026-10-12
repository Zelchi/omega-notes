import { getCurrentWindow } from "@tauri-apps/api/window";

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