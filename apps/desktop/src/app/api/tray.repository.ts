import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/shared/lib/tauri";

export type TrayAction = "pomodoro-toggle" | "pomodoro-reset" | "pomodoro-next" | "update";
export type TrayLabels = {
	show: string;
	hide: string;
	start: string;
	pause: string;
	reset: string;
	next: string;
	update: string;
	exit: string;
};

export const configureTrayMenu = (labels: TrayLabels, pomodoroRunning: boolean): Promise<void> =>
	isTauriRuntime() ? invoke("configure_tray_menu", { labels, pomodoroRunning }) : Promise.resolve();

export const onTrayAction = (handler: (action: TrayAction) => void): Promise<() => void> =>
	isTauriRuntime() ? listen<TrayAction>("omega-tray-action", event => handler(event.payload)) : Promise.resolve(() => {});
