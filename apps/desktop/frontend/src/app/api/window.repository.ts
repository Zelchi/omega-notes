import { confirm, invoke, isDesktopRuntime, listen } from '@/shared/lib/desktop';

export const confirmCloseWithoutSaving = (message: string, title: string, closeLabel: string, cancelLabel: string): Promise<boolean> =>
    confirm(message, { title, kind: 'warning', okLabel: closeLabel, cancelLabel });
export const isWindowMaximized = (): Promise<boolean> => invoke('window_is_maximized');
export const getWindowAxisSizes = (): Promise<{ width: number; height: number; workWidth: number; workHeight: number } | null> => invoke('window_axis_sizes');
export const isMainWindowVisible = (): Promise<boolean> => invoke('window_is_visible');
export const setWindowBackgroundColor = (color: string): Promise<void> => invoke('set_window_background_color', { color });
export const onWindowResized = (listener: () => void) => listen('window-resized', listener);
export const onWindowCloseRequested = (requestClose: (destroyWindow: () => Promise<void>) => void) =>
    listen('window-close-requested', () => requestClose(() => invoke('window_destroy')));
export const toggleWindowMaximize = (): Promise<void> => invoke('window_toggle_maximize');
export const minimizeWindow = (): Promise<void> => invoke('window_minimize');
export const closeWindow = (): Promise<void> => invoke('window_close');
export const hideMainWindow = (): Promise<void> => invoke('hide_main_window');
export const showMainWindow = (): Promise<void> => invoke('show_main_window');
export const showMainWindowIfHidden = async (): Promise<void> => {
    if (isDesktopRuntime() && !(await isMainWindowVisible())) await showMainWindow();
};
export const exitMainApp = (): Promise<void> => invoke('exit_main_app');
export const isGnomeDesktop = (): Promise<boolean> => invoke('is_gnome_desktop');
