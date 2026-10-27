import { invoke } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";

export type PomodoroTask = { id: string; title: string; completed: boolean; position: number };
export type PomodoroSettings = {
	focusMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	cyclesBeforeLongBreak: number;
};

const key = (vaultId: string) => `omega-notes.pomodoro-tasks.v1.${vaultId}`;
const settingsKey = "omega-notes.pomodoro-settings.v1";
const muteLofiDuringBreaksKey = "omega-notes.pomodoro-mute-lofi-during-breaks.v1";
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const defaultSettings: PomodoroSettings = {
	focusMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	cyclesBeforeLongBreak: 4,
};

const validMinutes = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 1440;
const validCycles = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;

export const readPomodoroSettings = (): PomodoroSettings => {
	try {
		const saved = localStorage.getItem(settingsKey);
		if (saved === null) return defaultSettings;
		const value = JSON.parse(saved) as Record<string, unknown>;
		const shortBreakMinutes = value.shortBreakMinutes ?? value.breakMinutes;
		const longBreakMinutes = value.longBreakMinutes ?? defaultSettings.longBreakMinutes;
		const cyclesBeforeLongBreak = value.cyclesBeforeLongBreak ?? defaultSettings.cyclesBeforeLongBreak;
		if (validMinutes(value.focusMinutes) && validMinutes(shortBreakMinutes)
			&& validMinutes(longBreakMinutes) && validCycles(cyclesBeforeLongBreak)) {
			return { focusMinutes: value.focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesBeforeLongBreak };
		}
	} catch { /* Armazenamento inválido ou indisponível mantém os tempos padrão. */ }
	return defaultSettings;
};

export const savePomodoroSettings = (settings: PomodoroSettings): boolean => {
	try {
		localStorage.setItem(settingsKey, JSON.stringify(settings));
		return true;
	} catch {
		return false;
	}
};

export const readMuteLofiDuringBreaks = (): boolean => {
	try {
		const saved = localStorage.getItem(muteLofiDuringBreaksKey);
		return saved !== "false";
	} catch { return true; }
};

export const saveMuteLofiDuringBreaks = (muted: boolean): boolean => {
	try {
		localStorage.setItem(muteLofiDuringBreaksKey, String(muted));
		return true;
	} catch { return false; }
};

const decode = (value: unknown): PomodoroTask[] => {
	if (!Array.isArray(value) || value.length > 1000) throw Error("POMODORO_STORAGE_FAILED");
	const ids = new Set<string>(), positions = new Set<number>();
	return value.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw Error("POMODORO_STORAGE_FAILED");
		const item = entry as Record<string, unknown>;
		if (typeof item.id !== "string" || !idPattern.test(item.id) || ids.has(item.id)
			|| typeof item.title !== "string" || !item.title.trim() || item.title.length > 500
			|| typeof item.completed !== "boolean" || typeof item.position !== "number"
			|| !Number.isSafeInteger(item.position) || item.position < 0 || item.position >= 1000
			|| positions.has(item.position)) throw Error("POMODORO_STORAGE_FAILED");
		ids.add(item.id);
		positions.add(item.position);
		return { id: item.id, title: item.title, completed: item.completed, position: item.position };
	}).sort((left, right) => left.position - right.position);
};

export const readPomodoroTasks = async (vaultId: string): Promise<PomodoroTask[]> => {
	if (isDesktopRuntime()) return decode(await invoke("read_pomodoro_tasks", { vaultId }));
	try {
		const saved = localStorage.getItem(key(vaultId));
		return saved === null ? [] : decode(JSON.parse(saved));
	} catch {
		throw Error("POMODORO_STORAGE_FAILED");
	}
};

export const savePomodoroTasks = async (vaultId: string, tasks: PomodoroTask[]): Promise<void> => {
	const safe = decode(tasks);
	if (isDesktopRuntime()) {
		await invoke("save_pomodoro_tasks", { vaultId, tasks: safe });
		return;
	}
	try {
		localStorage.setItem(key(vaultId), JSON.stringify(safe));
	} catch {
		throw Error("POMODORO_STORAGE_FAILED");
	}
};
