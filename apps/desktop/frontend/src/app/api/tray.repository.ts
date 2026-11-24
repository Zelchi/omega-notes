import { invoke } from "@/shared/lib/desktop";
import { listen } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";

type TrayAction = "pomodoro-toggle" | "pomodoro-reset" | "music-play-pause" | "music-next" | "update" | "exit";
type TrayLabels = {
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

export const configureTrayMenu = (labels: TrayLabels, pomodoroRunning: boolean, musicPlaying: boolean, pomodoroEnabled: boolean): Promise<void> =>
	isDesktopRuntime() ? invoke("configure_tray_menu", { labels, pomodoroRunning, musicPlaying, pomodoroEnabled }) : Promise.resolve();

export const onTrayAction = (handler: (action: TrayAction) => void): Promise<() => void> =>
	isDesktopRuntime() ? listen<TrayAction>("omega-tray-action", event => handler(event.payload)) : Promise.resolve(() => {});
