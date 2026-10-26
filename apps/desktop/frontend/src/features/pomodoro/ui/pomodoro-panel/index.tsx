import { createMemo, For, lazy, Show, Suspense, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import Icon from "@/shared/ui/icon";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { PomodoroTask } from "../../api/tasks.repository";
import type { usePomodoro } from "../../model/controller";
import { styles } from "./style.css.ts";

const LofiPlayerPanel = lazy(() => import("@/features/lofi-player/ui/lofi-player-panel"));

type Props = { pomodoro: ReturnType<typeof usePomodoro>; t: (key: TranslationKey) => string };

const PomodoroPanel: Component<Props> = (props) => {
	const presence = createPresence(props.pomodoro.open, 210);
	const { draft, setDraft, showSettings, setShowSettings, focusDraft, setFocusDraft, shortBreakDraft,
		setShortBreakDraft, longBreakDraft, setLongBreakDraft, cyclesDraft, setCyclesDraft, editingTaskId,
		setEditingTaskId, taskActionsVisibleId, setTaskActionsVisibleId, editDraft, setEditDraft } = props.pomodoro.view;
	const orderedTasks = createMemo(() => [...props.pomodoro.tasks()].sort((left, right) => left.position - right.position));
	const phaseLabel = () => props.pomodoro.phase() === "focus" ? "pomodoroFocus"
		: props.pomodoro.phase() === "shortBreak" ? "pomodoroShortBreak" : "pomodoroLongBreak";
	const timeLabel = () => {
		const seconds = props.pomodoro.seconds();
		const minutes = Math.floor(seconds / 60);
		return props.pomodoro.phaseSeconds() >= 3600
			? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
			: `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
	};
	const progress = () => {
		const total = props.pomodoro.phaseSeconds();
		return `${Math.max(0, Math.min(100, ((total - props.pomodoro.seconds()) / total) * 100))}%`;
	};
	const submitTask = (event: SubmitEvent) => {
		event.preventDefault();
		if (!draft().trim() || props.pomodoro.loading()) return;
		props.pomodoro.addTask(draft());
		setDraft("");
	};
	const saveSettings = () => props.pomodoro.setDurations(
		Number(focusDraft()), Number(shortBreakDraft()), Number(longBreakDraft()), Number(cyclesDraft()),
	);
	const toggleSettings = () => {
		if (showSettings() && (props.pomodoro.settingsError() ||
			Number(focusDraft()) !== props.pomodoro.focusMinutes() ||
			Number(shortBreakDraft()) !== props.pomodoro.shortBreakMinutes() ||
			Number(longBreakDraft()) !== props.pomodoro.longBreakMinutes() ||
			Number(cyclesDraft()) !== props.pomodoro.cyclesBeforeLongBreak())) saveSettings();
		props.pomodoro.toggleSettings();
	};
	const editTask = (task: PomodoroTask) => { setTaskActionsVisibleId(undefined); setEditingTaskId(task.id); setEditDraft(task.title); };
	const saveTaskEdit = (event: SubmitEvent, id: string) => {
		event.preventDefault();
		if (props.pomodoro.renameTask(id, editDraft())) { setEditingTaskId(undefined); setTaskActionsVisibleId(undefined); }
	};
	return <Show when={presence.present()}>
		<aside id="pomodoro-panel" class={styles.panel} aria-labelledby="pomodoro-heading"
			inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
			ref={(element) => registerVisibilityAnimation(element, presence.exiting, "panel-left")}
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				props.pomodoro.setOpen(false);
			}}>
			<AsciiBackdrop placement="modal" />
			<div class={styles.body}>
				<header class={styles.header}>
					<h2 id="pomodoro-heading" class={styles.title}>{props.t("pomodoroTitle")}</h2>
					<Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={() => props.pomodoro.setOpen(false)}>
						<Icon name="close" size={15} />
					</Button>
				</header>
				<Suspense fallback={null}><LofiPlayerPanel t={props.t} /></Suspense>
				<div class={styles.content}>
					<section class={styles.timer} aria-label={props.t("pomodoroTimer")}>
						<div class={styles.timerHeader}>
							<Button class={styles.iconButton} type="button" disabled={!props.pomodoro.timerReady() || showSettings()} aria-label={props.t("pomodoroNextPhase")}
								onClick={props.pomodoro.next}><Icon name="chevronRight" size={15} /></Button>
							<span class={styles.phase}>{props.t(phaseLabel())}</span>
							<Button class={styles.iconButton} type="button" disabled={!props.pomodoro.timerReady() || props.pomodoro.running()}
								aria-label={props.t("pomodoroSettings")} aria-expanded={showSettings()} onClick={toggleSettings}>
								<Icon name="settings" size={15} />
							</Button>
						</div>
						<Show when={showSettings() || props.pomodoro.settingsError()}>
							<div class={styles.settingsOverlay}>
								<Show when={showSettings()}>
									<div class={styles.settingsForm}>
										<label class={styles.setting}>
											<span>{props.t("pomodoroFocusDuration")}</span>
											<input class={styles.numberInput} type="number" min="1" max="120" step="1" required value={focusDraft()} onInput={event => setFocusDraft(event.currentTarget.value)} onChange={saveSettings} />
										</label>
										<label class={styles.setting}>
											<span>{props.t("pomodoroShortBreakDuration")}</span>
											<input class={styles.numberInput} type="number" min="1" max="1440" step="1" required value={shortBreakDraft()} onInput={event => setShortBreakDraft(event.currentTarget.value)} onChange={saveSettings} />
										</label>
										<label class={styles.setting}>
											<span>{props.t("pomodoroLongBreakDuration")}</span>
											<input class={styles.numberInput} type="number" min="1" max="1440" step="1" required value={longBreakDraft()} onInput={event => setLongBreakDraft(event.currentTarget.value)} onChange={saveSettings} />
										</label>
										<label class={styles.setting}>
											<span>{props.t("pomodoroCyclesBeforeLongBreak")}</span>
											<input class={styles.numberInput} type="number" min="1" max="100" step="1" required value={cyclesDraft()} onInput={event => setCyclesDraft(event.currentTarget.value)} onChange={saveSettings} />
										</label>
									</div>
								</Show>
								<Show when={props.pomodoro.settingsError()}>
									<p class={`${styles.error} ${styles.settingsError}`} role="alert">{props.t("pomodoroSettingsFailed")}</p>
								</Show>
							</div>
						</Show>
						<div class={styles.clock} role="timer" aria-live="off">{timeLabel()}</div>
						<div class={styles.progress} aria-hidden="true"><span class={styles.progressFill} style={{ width: progress() }} /></div>
						<div class={styles.timerActions}>
							<Button class={styles.primaryButton} type="button" disabled={!props.pomodoro.timerReady() || showSettings()} onClick={() => props.pomodoro.running() ? props.pomodoro.pause() : props.pomodoro.start()}>
								<Icon name={props.pomodoro.running() ? "pause" : "play"} size={16} />
							</Button>
							<Show when={props.pomodoro.timerReady() && props.pomodoro.seconds() !== props.pomodoro.phaseSeconds()}>
								<Button class={styles.resetButton} type="button" onClick={props.pomodoro.reset}>
									<Icon name="reset" size={14} />
								</Button>
							</Show>
						</div>
					</section>

					<section class={styles.tasks} aria-label={props.t("pomodoroTasks")}>
							<form class={styles.taskForm} onSubmit={submitTask}>
								<input class={styles.taskInput} value={draft()} maxLength={500} placeholder={props.t("pomodoroTaskPlaceholder")}
									aria-label={props.t("pomodoroTaskName")} disabled={props.pomodoro.loading() || props.pomodoro.readFailed() || orderedTasks().length >= 1000}
									onInput={event => setDraft(event.currentTarget.value)} />
								<Button class={styles.addButton} type="submit" disabled={!draft().trim() || props.pomodoro.loading() || props.pomodoro.readFailed() || orderedTasks().length >= 1000}
									aria-label={props.t("pomodoroAddTask")}><Icon name="send" size={15} /></Button>
							</form>
						<Show when={props.pomodoro.error()}><p class={styles.error} role="alert">{props.t("pomodoroStorageFailed")}</p></Show>
						<Show when={props.pomodoro.loading()}><p class={styles.loading}>{props.t("pomodoroLoading")}</p></Show>
						<CustomScrollArea ariaLabel={props.t("pomodoroTasks")} contentClass={styles.taskList} viewportStyle={{ padding: "2px 20px 10px 10px" }}>
							<For each={orderedTasks()}>{(task) => (
								<article class={styles.taskRow}
									onContextMenu={(event) => {
										if (editingTaskId() === task.id) return;
										event.preventDefault();
										event.stopPropagation();
										setTaskActionsVisibleId(current => current === task.id ? undefined : task.id);
									}}>
									<input class={styles.checkbox} type="checkbox" checked={task.completed} disabled={props.pomodoro.readFailed()} aria-label={`${props.t("pomodoroCompleteTask")}: ${task.title}`}
										onChange={() => props.pomodoro.toggleTask(task.id)} />
									<Show when={editingTaskId() === task.id} fallback={<span class={styles.taskTitle} classList={{ [styles.taskCompleted]: task.completed }}>{task.title}</span>}>
										<form class={styles.taskEditor} onSubmit={(event) => saveTaskEdit(event, task.id)}>
											<input class={styles.taskEditInput} value={editDraft()} maxLength={500} aria-label={props.t("pomodoroTaskName")}
												onInput={event => setEditDraft(event.currentTarget.value)} onKeyDown={event => {
											if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditingTaskId(undefined); setTaskActionsVisibleId(undefined); }
											}} />
											<Button class={styles.iconButton} type="submit" disabled={!editDraft().trim()} aria-label={props.t("save")}><Icon name="check" size={13} /></Button>
											<Button class={styles.iconButton} type="button" aria-label={props.t("cancel")} onClick={() => { setEditingTaskId(undefined); setTaskActionsVisibleId(undefined); }}><Icon name="close" size={13} /></Button>
										</form>
									</Show>
									<Show when={editingTaskId() !== task.id}>
									<div class={styles.taskActions}>
										<Button class={styles.actionReveal} classList={{ [styles.actionRevealVisible]: taskActionsVisibleId() === task.id }}
											type="button" disabled={taskActionsVisibleId() !== task.id || props.pomodoro.readFailed()} aria-hidden={taskActionsVisibleId() !== task.id} tabIndex={taskActionsVisibleId() === task.id ? 0 : -1}
											aria-label={`${props.t("pomodoroEditTask")}: ${task.title}`}
											onClick={() => editTask(task)}><Icon name="edit" size={13} /></Button>
										<Button class={`${styles.deleteButton} ${styles.actionReveal} ${styles.actionRevealTrailing}`}
											classList={{ [styles.actionRevealVisible]: taskActionsVisibleId() === task.id, [styles.actionRevealTrailingVisible]: taskActionsVisibleId() === task.id }}
											type="button" disabled={taskActionsVisibleId() !== task.id || props.pomodoro.readFailed()} aria-hidden={taskActionsVisibleId() !== task.id} tabIndex={taskActionsVisibleId() === task.id ? 0 : -1}
											aria-label={`${props.t("pomodoroDeleteTask")}: ${task.title}`}
											onClick={() => { setTaskActionsVisibleId(undefined); props.pomodoro.removeTask(task.id); }}><Icon name="delete" size={13} /></Button>
									</div>
									</Show>
								</article>
							)}</For>
						</CustomScrollArea>
					</section>
				</div>
			</div>
		</aside>
	</Show>;
};

export default PomodoroPanel;
