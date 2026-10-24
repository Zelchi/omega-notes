import { invoke } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import type { PomodoroSettings } from "./tasks.repository";

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";
export type PomodoroTimerSnapshot = {
	phase: PomodoroPhase;
	remainingSeconds: number;
	durationSeconds: number;
	running: boolean;
	focusMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	cyclesBeforeLongBreak: number;
};

let commandQueue = Promise.resolve();

const command = <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
	if (!isDesktopRuntime()) return Promise.reject(Error("POMODORO_TIMER_UNAVAILABLE"));
	const result = commandQueue.then(() => invoke<T>(name, args));
	commandQueue = result.then(() => undefined, () => undefined);
	return result;
};

export const initializePomodoroTimer = (settings: PomodoroSettings): Promise<PomodoroTimerSnapshot> => command("initialize_pomodoro_timer", settings);
export const setPomodoroSettings = (settings: PomodoroSettings): Promise<PomodoroTimerSnapshot> => command("set_pomodoro_settings", settings);
export const readPomodoroTimer = (): Promise<PomodoroTimerSnapshot> => command("read_pomodoro_timer");
export const startPomodoroTimer = (): Promise<PomodoroTimerSnapshot> => command("start_pomodoro_timer");
export const pausePomodoroTimer = (): Promise<PomodoroTimerSnapshot> => command("pause_pomodoro_timer");
export const resetPomodoroTimer = (): Promise<PomodoroTimerSnapshot> => command("reset_pomodoro_timer");
export const nextPomodoroPhase = (): Promise<PomodoroTimerSnapshot> => command("next_pomodoro_phase");
