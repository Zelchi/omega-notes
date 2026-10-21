import { createMemo, createSignal, For, Show, type Component } from "solid-js";
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

type Props = { pomodoro: ReturnType<typeof usePomodoro>; t: (key: TranslationKey) => string };

const PomodoroPanel: Component<Props> = (props) => {
	const presence = createPresence(props.pomodoro.open, 210);
	const { draft, setDraft, showSettings, setShowSettings, focusDraft, setFocusDraft, shortBreakDraft,
		setShortBreakDraft, longBreakDraft, setLongBreakDraft, cyclesDraft, setCyclesDraft, editingTaskId,
		setEditingTaskId, editDraft, setEditDraft } = props.pomodoro.view;
	const [draggedTaskId, setDraggedTaskId] = createSignal<string>();
	const [dropTargetId, setDropTargetId] = createSignal<string>();
	const orderedTasks = createMemo(() => [...props.pomodoro.tasks()].sort((left, right) => left.position - right.position));
	const completedCount = () => orderedTasks().filter(task => task.completed).length;
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
	const openSettings = props.pomodoro.toggleSettings;
	const saveSettings = (event: SubmitEvent) => {
		event.preventDefault();
		const saved = props.pomodoro.setDurations(Number(focusDraft()), Number(shortBreakDraft()), Number(longBreakDraft()), Number(cyclesDraft()));
		if (saved) setShowSettings(false);
	};
	const editTask = (task: PomodoroTask) => { setEditingTaskId(task.id); setEditDraft(task.title); };
	const saveTaskEdit = (event: SubmitEvent, id: string) => {
		event.preventDefault();
		if (props.pomodoro.renameTask(id, editDraft())) setEditingTaskId(undefined);
	};
	const dropTask = (event: DragEvent, targetId: string) => {
		if (!draggedTaskId() || !event.dataTransfer) return;
		event.preventDefault();
		const sourceId = event.dataTransfer.getData("text/plain") || draggedTaskId();
		const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
		if (sourceId && bounds) props.pomodoro.moveTask(sourceId, targetId, event.clientY > bounds.top + bounds.height / 2);
		setDraggedTaskId(undefined);
		setDropTargetId(undefined);
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
				<div class={styles.content}>
					<section class={styles.timer} aria-label={props.t("pomodoroTimer")}>
						<div class={styles.timerHeader}>
							<Button class={styles.iconButton} type="button" disabled={!props.pomodoro.timerReady() || showSettings()} aria-label={props.t("pomodoroNextPhase")}
								onClick={props.pomodoro.next}><Icon name="chevronRight" size={15} /></Button>
							<span class={styles.phase}>{props.t(phaseLabel())}</span>
							<Button class={styles.iconButton} type="button" disabled={!props.pomodoro.timerReady() || props.pomodoro.running()}
								aria-label={props.t("pomodoroSettings")} aria-expanded={showSettings()} onClick={openSettings}>
								<Icon name="settings" size={15} />
							</Button>
						</div>
						<div class={styles.clock} role="timer" aria-live="off">{timeLabel()}</div>
						<div class={styles.progress} aria-hidden="true"><span class={styles.progressFill} style={{ width: progress() }} /></div>
						<div class={styles.timerActions}>
							<Button class={styles.primaryButton} type="button" disabled={!props.pomodoro.timerReady() || showSettings()} onClick={() => props.pomodoro.running() ? props.pomodoro.pause() : props.pomodoro.start()}>
								{props.t(props.pomodoro.running() ? "pomodoroPause" : "pomodoroStart")}
							</Button>
							<Button class={styles.button} type="button" disabled={!props.pomodoro.timerReady()} onClick={props.pomodoro.reset}>
								<Icon name="reset" size={14} />{props.t("pomodoroReset")}
							</Button>
						</div>
						<Show when={showSettings()}>
							<form class={styles.settings} onSubmit={saveSettings}>
								<label class={styles.setting}>
									<span>{props.t("pomodoroFocusDuration")}</span>
									<input class={styles.numberInput} type="number" min="1" max="120" step="1" required value={focusDraft()} onInput={event => setFocusDraft(event.currentTarget.value)} />
								</label>
								<label class={styles.setting}>
									<span>{props.t("pomodoroShortBreakDuration")}</span>
									<input class={styles.numberInput} type="number" min="1" max="1440" step="1" required value={shortBreakDraft()} onInput={event => setShortBreakDraft(event.currentTarget.value)} />
								</label>
								<label class={styles.setting}>
									<span>{props.t("pomodoroLongBreakDuration")}</span>
									<input class={styles.numberInput} type="number" min="1" max="1440" step="1" required value={longBreakDraft()} onInput={event => setLongBreakDraft(event.currentTarget.value)} />
								</label>
								<label class={styles.setting}>
									<span>{props.t("pomodoroCyclesBeforeLongBreak")}</span>
									<input class={styles.numberInput} type="number" min="1" max="100" step="1" required value={cyclesDraft()} onInput={event => setCyclesDraft(event.currentTarget.value)} />
								</label>
								<Button class={styles.formButton} type="submit">{props.t("save")}</Button>
							</form>
						</Show>
						<Show when={props.pomodoro.settingsError()}><p class={styles.error} role="alert">{props.t("pomodoroSettingsFailed")}</p></Show>
					</section>

					<section class={styles.tasks} aria-labelledby="pomodoro-tasks-heading">
						<header class={styles.tasksHeader}>
							<h3 id="pomodoro-tasks-heading" class={styles.tasksTitle}>{props.t("pomodoroTasks")}</h3>
							<span class={styles.count}>{props.t("pomodoroTaskCount").replace("{done}", String(completedCount())).replace("{total}", String(orderedTasks().length))}</span>
						</header>
						<form class={styles.taskForm} onSubmit={submitTask}>
							<input class={styles.taskInput} value={draft()} maxLength={500} placeholder={props.t("pomodoroTaskPlaceholder")}
								aria-label={props.t("pomodoroTaskName")} disabled={props.pomodoro.loading() || props.pomodoro.readFailed() || orderedTasks().length >= 1000}
								onInput={event => setDraft(event.currentTarget.value)} />
							<Button class={styles.addButton} type="submit" disabled={!draft().trim() || props.pomodoro.loading() || props.pomodoro.readFailed() || orderedTasks().length >= 1000}
								aria-label={props.t("pomodoroAddTask")}><Icon name="add" size={16} /></Button>
						</form>
						<Show when={props.pomodoro.error()}><p class={styles.error} role="alert">{props.t("pomodoroStorageFailed")}</p></Show>
						<Show when={props.pomodoro.loading()}><p class={styles.loading}>{props.t("pomodoroLoading")}</p></Show>
						<CustomScrollArea ariaLabel={props.t("pomodoroTasks")} contentClass={styles.taskList} viewportStyle={{ padding: "2px 10px 10px 2px" }}>
							<For each={orderedTasks()}>{(task, index) => (
								<article class={styles.taskRow} classList={{ [styles.taskDragging]: draggedTaskId() === task.id, [styles.taskDropTarget]: dropTargetId() === task.id }}
									onDragOver={(event) => {
										if (!draggedTaskId() || draggedTaskId() === task.id || !event.dataTransfer) return;
										event.preventDefault();
										event.dataTransfer.dropEffect = "move";
										setDropTargetId(task.id);
									}}
									onDragLeave={(event) => {
										if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(undefined);
									}}
									onDrop={(event) => dropTask(event, task.id)}
									onDragEnd={() => { setDraggedTaskId(undefined); setDropTargetId(undefined); }}>
									<span class={styles.dragHandle} draggable={!props.pomodoro.readFailed() && editingTaskId() !== task.id}
										aria-label={props.t("pomodoroDragTask")} title={props.t("pomodoroDragTask")}
										onDragStart={(event) => {
											if (!event.dataTransfer || props.pomodoro.readFailed()) { event.preventDefault(); return; }
											setDraggedTaskId(task.id);
											event.dataTransfer.effectAllowed = "move";
											event.dataTransfer.setData("text/plain", task.id);
										}}><Icon name="gripVertical" size={14} /></span>
									<input class={styles.checkbox} type="checkbox" checked={task.completed} disabled={props.pomodoro.readFailed()} aria-label={`${props.t("pomodoroCompleteTask")}: ${task.title}`}
										onChange={() => props.pomodoro.toggleTask(task.id)} />
									<Show when={editingTaskId() === task.id} fallback={<Button class={styles.taskTitle} classList={{ [styles.taskCompleted]: task.completed }} type="button"
											aria-label={`${props.t("pomodoroEditTask")}: ${task.title}`} title={task.title} disabled={props.pomodoro.readFailed()} onClick={() => editTask(task)}>{task.title}</Button>}>
										<form class={styles.taskEditor} onSubmit={(event) => saveTaskEdit(event, task.id)}>
											<input class={styles.taskEditInput} value={editDraft()} maxLength={500} aria-label={props.t("pomodoroTaskName")}
												onInput={event => setEditDraft(event.currentTarget.value)} onKeyDown={event => {
												if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditingTaskId(undefined); }
											}} />
											<Button class={styles.iconButton} type="submit" disabled={!editDraft().trim()} aria-label={props.t("save")}><Icon name="check" size={13} /></Button>
											<Button class={styles.iconButton} type="button" aria-label={props.t("cancel")} onClick={() => setEditingTaskId(undefined)}><Icon name="close" size={13} /></Button>
										</form>
									</Show>
									<Show when={editingTaskId() !== task.id}>
									<div class={styles.taskActions}>
										<Button class={styles.iconButton} type="button" disabled={props.pomodoro.readFailed() || index() === 0} aria-label={props.t("pomodoroMoveTaskUp")}
											onClick={() => { const target = orderedTasks()[index() - 1]; if (target) props.pomodoro.moveTask(task.id, target.id, false); }}><span class={styles.upIcon}><Icon name="chevronDown" size={13} /></span></Button>
										<Button class={styles.iconButton} type="button" disabled={props.pomodoro.readFailed() || index() === orderedTasks().length - 1} aria-label={props.t("pomodoroMoveTaskDown")}
											onClick={() => { const target = orderedTasks()[index() + 1]; if (target) props.pomodoro.moveTask(task.id, target.id, true); }}><Icon name="chevronDown" size={13} /></Button>
										<Button class={`${styles.iconButton} ${styles.deleteButton}`} type="button" disabled={props.pomodoro.readFailed()} aria-label={`${props.t("pomodoroDeleteTask")}: ${task.title}`}
											onClick={() => { if (editingTaskId() === task.id) setEditingTaskId(undefined); props.pomodoro.removeTask(task.id); }}><Icon name="delete" size={13} /></Button>
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
