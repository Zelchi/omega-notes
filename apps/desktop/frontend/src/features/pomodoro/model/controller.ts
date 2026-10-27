import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { playSound } from "@/shared/ui/sound";
import { readMuteLofiDuringBreaks, readPomodoroSettings, readPomodoroTasks, saveMuteLofiDuringBreaks, savePomodoroSettings, savePomodoroTasks, type PomodoroTask } from "../api/tasks.repository";
import { initializePomodoroTimer, nextPomodoroPhase, pausePomodoroTimer, readPomodoroTimer, resetPomodoroTimer, setPomodoroSettings, startPomodoroTimer, type PomodoroPhase, type PomodoroTimerSnapshot } from "../api/timer.repository";
import { isDesktopRuntime } from "@/shared/lib/desktop";

const maxTasks = 1000;
const alarmMuteMs = 700;

export const shouldMuteLofi = (phase: PomodoroPhase, muteDuringBreaks: boolean, alarmActive: boolean): boolean =>
	alarmActive || (muteDuringBreaks && phase !== "focus");

export const endsFocusPhase = (phase: PomodoroPhase, nextPhase: PomodoroPhase): boolean =>
	phase === "focus" && nextPhase !== "focus";

export const usePomodoro = (vaultId: Accessor<string | undefined>, onFocusPhaseEnd?: () => void) => {
	const [open, setOpen] = createSignal(false);
	const [tasks, setTasks] = createSignal<PomodoroTask[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal(false);
	const [readFailed, setReadFailed] = createSignal(false);
	const [writeFailed, setWriteFailed] = createSignal(false);
	const [settingsError, setSettingsError] = createSignal(false);
	const [muteLofiDuringBreaks, setMuteLofiDuringBreaksSignal] = createSignal(readMuteLofiDuringBreaks());
	const [alarmActive, setAlarmActive] = createSignal(false);
	const initialSettings = readPomodoroSettings();
	const [phase, setPhase] = createSignal<PomodoroPhase>("focus");
	const [focusMinutes, setFocusMinutes] = createSignal(initialSettings.focusMinutes);
	const [shortBreakMinutes, setShortBreakMinutes] = createSignal(initialSettings.shortBreakMinutes);
	const [longBreakMinutes, setLongBreakMinutes] = createSignal(initialSettings.longBreakMinutes);
	const [cyclesBeforeLongBreak, setCyclesBeforeLongBreak] = createSignal(initialSettings.cyclesBeforeLongBreak);
	const [seconds, setSeconds] = createSignal(initialSettings.focusMinutes * 60);
	const [phaseSeconds, setPhaseSeconds] = createSignal(initialSettings.focusMinutes * 60);
	const [running, setRunning] = createSignal(false);
	const [timerReady, setTimerReady] = createSignal(false);
	const [draft, setDraft] = createSignal("");
	const [showSettings, setShowSettings] = createSignal(false);
	const [focusDraft, setFocusDraft] = createSignal(String(initialSettings.focusMinutes));
	const [shortBreakDraft, setShortBreakDraft] = createSignal(String(initialSettings.shortBreakMinutes));
	const [longBreakDraft, setLongBreakDraft] = createSignal(String(initialSettings.longBreakMinutes));
	const [cyclesDraft, setCyclesDraft] = createSignal(String(initialSettings.cyclesBeforeLongBreak));
	const [editingTaskId, setEditingTaskId] = createSignal<string>();
	const [taskActionsVisibleId, setTaskActionsVisibleId] = createSignal<string>();
	const [editDraft, setEditDraft] = createSignal("");
	const view = { draft, setDraft, showSettings, setShowSettings, focusDraft, setFocusDraft, shortBreakDraft, setShortBreakDraft, longBreakDraft, setLongBreakDraft, cyclesDraft, setCyclesDraft, editingTaskId, setEditingTaskId, taskActionsVisibleId, setTaskActionsVisibleId, editDraft, setEditDraft };
	let timer: ReturnType<typeof setInterval> | undefined;
	let alarmMuteTimer: ReturnType<typeof setTimeout> | undefined;
	let timerRevision = 0, timerReadPending = false, timerErrorLogged = false;
	let loadRevision = 0, writeRevision = 0;
	const writes = new Map<string, Promise<void>>();

	const clearTimer = () => { clearInterval(timer); timer = undefined; };
	const applySnapshot = (snapshot: PomodoroTimerSnapshot, playPhaseChange: boolean) => {
		if (playPhaseChange && phase() !== snapshot.phase) {
			if (endsFocusPhase(phase(), snapshot.phase)) onFocusPhaseEnd?.();
			setAlarmActive(true);
			clearTimeout(alarmMuteTimer);
			alarmMuteTimer = setTimeout(() => { alarmMuteTimer = undefined; setAlarmActive(false); }, alarmMuteMs);
			playSound("pomodoro-alarm");
		}
		setPhase(snapshot.phase);
		setPhaseSeconds(snapshot.durationSeconds);
		setSeconds(snapshot.remainingSeconds);
		setRunning(snapshot.running);
		setFocusMinutes(snapshot.focusMinutes);
		setShortBreakMinutes(snapshot.shortBreakMinutes);
		setLongBreakMinutes(snapshot.longBreakMinutes);
		setCyclesBeforeLongBreak(snapshot.cyclesBeforeLongBreak);
		timerErrorLogged = false;
	};
	const reportTimerError = (error: unknown) => {
		if (!timerErrorLogged) console.error("Pomodoro timer failed", error);
		timerErrorLogged = true;
		timerRevision += 1;
		clearTimer();
		setRunning(false);
		setTimerReady(false);
	};
	const startPolling = () => {
		if (!timer) timer = setInterval(() => { void tick(); }, 250);
	};
	const tick = async () => {
		if (!timerReady() || !running() || timerReadPending) return;
		const revision = timerRevision;
		timerReadPending = true;
		try {
			const snapshot = await readPomodoroTimer();
			if (revision !== timerRevision || !running()) return;
			applySnapshot(snapshot, true);
			if (!snapshot.running) clearTimer();
		} catch (error) {
			if (revision === timerRevision) reportTimerError(error);
		} finally {
			timerReadPending = false;
		}
	};
	const start = () => {
		if (!timerReady() || running()) return;
		const revision = ++timerRevision;
		setRunning(true);
		void startPomodoroTimer().then(snapshot => {
			if (revision !== timerRevision) return;
			applySnapshot(snapshot, false);
			if (snapshot.running) startPolling();
		}).catch(error => { if (revision === timerRevision) reportTimerError(error); });
	};
	const pause = () => {
		if (!timerReady() || !running()) return;
		const revision = ++timerRevision;
		clearTimer();
		setRunning(false);
		void pausePomodoroTimer().then(snapshot => {
			if (revision !== timerRevision) return;
			applySnapshot(snapshot, true);
		}).catch(error => { if (revision === timerRevision) reportTimerError(error); });
	};
	const reset = () => {
		if (!timerReady()) return;
		timerRevision += 1;
		clearTimer();
		setRunning(false);
		void resetPomodoroTimer().then(snapshot => applySnapshot(snapshot, false)).catch(reportTimerError);
	};
	const next = () => {
		if (!timerReady()) return;
		timerRevision += 1;
		clearTimer();
		setRunning(false);
		void nextPomodoroPhase().then(snapshot => applySnapshot(snapshot, false)).catch(reportTimerError);
	};
	const setDurations = (focus: number, shortBreak: number, longBreak: number, cycles: number) => {
		if (!timerReady() || running() || ![focus, shortBreak, longBreak].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 1440)
			|| !Number.isSafeInteger(cycles) || cycles < 1 || cycles > 100) return false;
		if (!savePomodoroSettings({ focusMinutes: focus, shortBreakMinutes: shortBreak, longBreakMinutes: longBreak, cyclesBeforeLongBreak: cycles })) {
			setSettingsError(true);
			return false;
		}
		setSettingsError(false);
		setFocusMinutes(focus);
		setShortBreakMinutes(shortBreak);
		setLongBreakMinutes(longBreak);
		setCyclesBeforeLongBreak(cycles);
		void setPomodoroSettings({ focusMinutes: focus, shortBreakMinutes: shortBreak, longBreakMinutes: longBreak, cyclesBeforeLongBreak: cycles })
			.then(snapshot => applySnapshot(snapshot, false)).catch(reportTimerError);
		return true;
	};
	const setMuteLofiDuringBreaks = (muted: boolean) => {
		if (!saveMuteLofiDuringBreaks(muted)) { setSettingsError(true); return false; }
		setMuteLofiDuringBreaksSignal(muted);
		setSettingsError(false);
		return true;
	};
	const toggleSettings = () => {
		if (showSettings()) { setShowSettings(false); return; }
		setFocusDraft(String(focusMinutes())); setShortBreakDraft(String(shortBreakMinutes()));
		setLongBreakDraft(String(longBreakMinutes())); setCyclesDraft(String(cyclesBeforeLongBreak()));
		setShowSettings(true);
	};

	if (isDesktopRuntime()) {
		void initializePomodoroTimer(initialSettings).then(snapshot => {
			setTimerReady(true);
			applySnapshot(snapshot, false);
			savePomodoroSettings({
				focusMinutes: snapshot.focusMinutes,
				shortBreakMinutes: snapshot.shortBreakMinutes,
				longBreakMinutes: snapshot.longBreakMinutes,
				cyclesBeforeLongBreak: snapshot.cyclesBeforeLongBreak,
			});
			if (snapshot.running) startPolling();
		}).catch(reportTimerError);
	}

	createEffect(on(vaultId, (id) => {
		const revision = ++loadRevision;
		setOpen(false);
		setTasks([]);
		setDraft(""); setEditingTaskId(undefined); setTaskActionsVisibleId(undefined); setEditDraft("");
		setError(false);
		setReadFailed(false);
		setWriteFailed(false);
		if (!id) { setLoading(false); return; }
		setLoading(true);
		const pendingWrite = writes.get(id);
		void (pendingWrite ? pendingWrite.catch(() => undefined) : Promise.resolve())
			.then(() => readPomodoroTasks(id))
			.then((saved) => { if (revision === loadRevision && vaultId() === id) setTasks(saved); })
			.catch(() => { if (revision === loadRevision && vaultId() === id) { setError(true); setReadFailed(true); } })
			.finally(() => { if (revision === loadRevision) setLoading(false); });
	}, { defer: false }));

	const persist = (next: PomodoroTask[]) => {
		const id = vaultId();
		if (!id || readFailed()) return;
		const revision = ++writeRevision;
		setTasks(next);
		setError(false);
		setWriteFailed(false);
		const previous = writes.get(id) ?? Promise.resolve();
		const pending = previous.catch(() => undefined).then(() => savePomodoroTasks(id, next));
		writes.set(id, pending);
		void pending.then(() => {
			if (vaultId() === id && revision === writeRevision) setError(false);
		}, () => {
			if (vaultId() === id && revision === writeRevision) { setError(true); setWriteFailed(true); }
		}).finally(() => { if (writes.get(id) === pending) writes.delete(id); });
	};

	const addTask = (title: string) => {
		const normalized = title.trim(), current = tasks();
		if (!vaultId() || loading() || readFailed() || !normalized || normalized.length > 500 || current.length >= maxTasks) return;
		const position = current.reduce((max, task) => Math.max(max, task.position), -1) + 1;
		if (position >= maxTasks) return;
		persist([...current, { id: crypto.randomUUID(), title: normalized, completed: false, position }]);
	};
	const toggleTask = (id: string) => { if (!readFailed()) persist(tasks().map(task => task.id === id ? { ...task, completed: !task.completed } : task)); };
	const renameTask = (id: string, title: string) => {
		const normalized = title.trim();
		const current = tasks();
		if (readFailed() || !normalized || normalized.length > 500 || !current.some(task => task.id === id)) return false;
		persist(current.map(task => task.id === id ? { ...task, title: normalized } : task));
		return true;
	};
	const removeTask = (id: string) => {
		if (readFailed()) return;
		persist(tasks().filter(task => task.id !== id)
			.sort((left, right) => left.position - right.position)
			.map((task, position) => ({ ...task, position })));
	};
	const flushSave = async () => {
		try { await Promise.all(writes.values()); return !writeFailed(); }
		catch { return false; }
	};

	onCleanup(() => { timerRevision += 1; clearTimer(); clearTimeout(alarmMuteTimer); });
	return {
		open, setOpen, tasks, loading, error, readFailed, settingsError, addTask, renameTask, toggleTask, removeTask, flushSave, view, toggleSettings,
		phase, phaseSeconds, timerReady, focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesBeforeLongBreak, seconds, running, start, pause, reset, next, setDurations,
		muteLofiDuringBreaks, setMuteLofiDuringBreaks,
		muteLofi: () => shouldMuteLofi(phase(), muteLofiDuringBreaks(), alarmActive()),
	};
};
