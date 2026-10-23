import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";

const isLinux = typeof navigator !== "undefined" && navigator.platform.toLowerCase().startsWith("linux");

export const confirmCloseWithoutSaving = (message: string, title: string, closeLabel: string, cancelLabel: string): Promise<boolean> =>
	confirm(message, { title, kind: "warning", okLabel: closeLabel, cancelLabel });

export const isWindowMaximized = (): Promise<boolean> => getCurrentWindow().isMaximized();
export const setWindowBackgroundColor = (color: string): Promise<void> =>
	isLinux ? invoke("set_window_background_color", { color }) : getCurrentWindow().setBackgroundColor(color);

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
export const showMainWindow = (): Promise<void> => invoke("show_main_window");
export const exitMainApp = (): Promise<void> => invoke("exit_main_app");
export const startWindowDrag = (): Promise<void> => invoke("start_window_drag");
export type WindowResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];
export const startWindowResizeDrag = (direction: WindowResizeDirection, x: number, y: number): Promise<void> =>
	isLinux ? invoke("start_window_resize", { direction, x, y }) : getCurrentWindow().startResizeDragging(direction);
export const isGnomeDesktop = (): Promise<boolean> => invoke("is_gnome_desktop");
