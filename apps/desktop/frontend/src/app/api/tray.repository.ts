import { invoke } from "@/shared/lib/desktop";
import { listen } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";

export type TrayAction = "pomodoro-toggle" | "pomodoro-reset" | "music-play-pause" | "music-next" | "update" | "exit";
export type TrayLabels = {
	show: string;
	hide: string;
	start: string;
	pause: string;
	reset: string;
	musicPlay: string;
	musicPause: string;
	musicNext: string;
	update: string;
	exit: string;
};

export const configureTrayMenu = (labels: TrayLabels, pomodoroRunning: boolean, musicPlaying: boolean): Promise<void> =>
	isDesktopRuntime() ? invoke("configure_tray_menu", { labels, pomodoroRunning, musicPlaying }) : Promise.resolve();

export const onTrayAction = (handler: (action: TrayAction) => void): Promise<() => void> =>
	isDesktopRuntime() ? listen<TrayAction>("omega-tray-action", event => handler(event.payload)) : Promise.resolve(() => {});
