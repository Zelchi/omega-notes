import { invoke } from "@/shared/lib/desktop";
import { listen } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";

export type TrayAction = "pomodoro-toggle" | "pomodoro-reset" | "pomodoro-next" | "update" | "exit";
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
	isDesktopRuntime() ? invoke("configure_tray_menu", { labels, pomodoroRunning }) : Promise.resolve();

export const onTrayAction = (handler: (action: TrayAction) => void): Promise<() => void> =>
	isDesktopRuntime() ? listen<TrayAction>("omega-tray-action", event => handler(event.payload)) : Promise.resolve(() => {});
