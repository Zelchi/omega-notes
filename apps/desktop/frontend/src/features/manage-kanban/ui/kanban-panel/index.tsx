import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import Icon from "@/shared/ui/icon";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import { kanbanSlotCount, kanbanStatusLabels, kanbanStatuses, maxKanbanItems, type KanbanItem, type KanbanStatus } from "../../model/kanban";
import type { useKanban } from "../../model/controller";
import { styles } from "./style.css.ts";

type Props = {
	kanban: ReturnType<typeof useKanban>;
	vaultId?: string;
	t: (key: TranslationKey) => string;
};

const cardDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });
const formatCardDate = (value: number | null) => value === null ? "—" : cardDateFormatter.format(value);

const KanbanPanel: Component<Props> = (props) => {
	const presence = createPresence(props.kanban.open, 210);
	const { adding, setAdding, draft, setDraft, editing, setEditing, editDraft, setEditDraft,
		actionsVisibleId, setActionsVisibleId, collapsedStatuses, setCollapsedStatuses } = props.kanban.view;
	const [draggedId, setDraggedId] = createSignal<string>();
	const [dropTarget, setDropTarget] = createSignal<{ status: KanbanStatus; position: number }>();

	const byStatus = createMemo(() => {
		const grouped = new Map<KanbanStatus, Map<number, KanbanItem>>(kanbanStatuses.map((status) => [status, new Map()]));
		for (const item of props.kanban.items()) grouped.get(item.status)?.set(item.position, item);
		return grouped;
	});
	const slotPositions = (status: KanbanStatus) => {
		const positions = byStatus().get(status) ?? new Map<number, KanbanItem>();
		const lastPosition = Math.max(-1, ...positions.keys());
		return Array.from({ length: kanbanSlotCount(lastPosition) }, (_, index) => index);
	};
	const isCollapsed = (status: KanbanStatus) => collapsedStatuses().has(status);
	const setStatusCollapsed = (status: KanbanStatus, collapsed: boolean) => setCollapsedStatuses(current => {
		if (current.has(status) === collapsed) return current;
		const next = new Set(current);
		if (collapsed) next.add(status);
		else next.delete(status);
		return next;
	});
	const submitNew = (event: SubmitEvent, status: KanbanStatus) => {
		event.preventDefault();
		if (!draft().trim()) return;
		props.kanban.add(draft(), status);
		setDraft("");
		setAdding(undefined);
	};
	const submitEdit = (event: SubmitEvent, itemId: string) => {
		event.preventDefault();
		if (!editDraft().trim()) return;
		props.kanban.rename(itemId, editDraft());
		setEditing(undefined);
	};
	const renderCard = (item: KanbanItem) => {
		const actionsVisible = () => actionsVisibleId() === item.id;
		return (
			<article class={styles.card} classList={{ [styles.dragging]: draggedId() === item.id }}
				draggable={editing() !== item.id}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setActionsVisibleId(current => current === item.id ? undefined : item.id);
				}}
				onDragStart={(event) => {
					if (editing() === item.id) { event.preventDefault(); return; }
					if (!event.dataTransfer) return;
					setDraggedId(item.id);
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", item.id);
				}}
				onDragEnd={() => { setDraggedId(undefined); setDropTarget(undefined); }}>
				<Show when={editing() === item.id} fallback={<div class={styles.cardTitle}>{item.title}</div>}>
					<form class={styles.cardEditor} onSubmit={(event) => submitEdit(event, item.id)}>
						<input class={`${styles.cardInput} ${styles.cardEditorInput}`} value={editDraft()} maxLength={500}
							aria-label={props.t("kanbanItemTitle")} onInput={(event) => setEditDraft(event.currentTarget.value)} />
						<div class={styles.formActions}>
							<Button class={styles.formButton} type="button" onClick={() => setEditing(undefined)}>{props.t("cancel")}</Button>
							<Button class={styles.formButton} type="submit" disabled={!editDraft().trim()}>{props.t("save")}</Button>
						</div>
					</form>
				</Show>
				<div class={styles.cardMeta}>
					<span class={styles.cardMetaLine} aria-label={`${props.t("kanbanCreatedAt")}: ${formatCardDate(item.createdAt)}`}>
						<Icon name="calendar" size={11} />{formatCardDate(item.createdAt)}
					</span>
					<span class={styles.cardMetaLine} aria-label={`${props.t("kanbanUpdatedAt")}: ${formatCardDate(item.updatedAt)}`}>
						<Icon name="clock" size={11} />{formatCardDate(item.updatedAt)}
					</span>
				</div>
				<Show when={editing() !== item.id}>
					<div class={styles.cardActions}>
						<Button class={styles.actionReveal} classList={{ [styles.actionRevealVisible]: actionsVisible() }}
							type="button" disabled={!actionsVisible()} aria-hidden={!actionsVisible()} tabIndex={actionsVisible() ? 0 : -1}
							aria-label={props.t("kanbanEditItem")}
							onClick={() => { setActionsVisibleId(undefined); setEditing(item.id); setEditDraft(item.title); }}>
							<Icon name="edit" size={14} />
						</Button>
						<Button class={`${styles.deleteButton} ${styles.actionReveal} ${styles.actionRevealTrailing}`}
							classList={{ [styles.actionRevealVisible]: actionsVisible(), [styles.actionRevealTrailingVisible]: actionsVisible() }}
							type="button" disabled={!actionsVisible()} aria-hidden={!actionsVisible()} tabIndex={actionsVisible() ? 0 : -1}
							aria-label={props.t("kanbanDeleteItem")}
							onClick={() => { setActionsVisibleId(undefined); props.kanban.remove(item.id); }}>
							<Icon name="delete" size={14} />
						</Button>
					</div>
				</Show>
			</article>
		);
	};

	return <Show when={presence.present()}>
		<aside id="kanban-panel" class={styles.panel} aria-labelledby="kanban-heading"
			inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
			ref={(element) => registerVisibilityAnimation(element, presence.exiting, "panel-left")}
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				props.kanban.setOpen(false);
			}}>
			<AsciiBackdrop placement="modal" />
			<div class={styles.body}>
				<header class={styles.header}>
					<h2 id="kanban-heading" class={styles.title}>{props.t("kanbanTitle")}</h2>
					<Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={() => props.kanban.setOpen(false)}>
						<Icon name="close" size={15} />
					</Button>
				</header>
				<div class={styles.content}>
					<Show when={props.kanban.error()}><p class={styles.error} role="alert">{props.t("kanbanStorageFailed")}</p></Show>
					<Show when={props.kanban.items().length >= maxKanbanItems}><p class={styles.loading} role="status">{props.t("kanbanLimitReached")}</p></Show>
					<Show when={props.kanban.loading()}><p class={styles.loading}>{props.t("kanbanLoading")}</p></Show>
					<CustomScrollArea ariaLabel={props.t("kanbanTitle")} contentClass={styles.lanes} viewportStyle={{ padding: "2px 12px 12px 2px" }}>
						<For each={kanbanStatuses}>{(status) => {
							const items = () => byStatus().get(status) ?? new Map<number, KanbanItem>();
							return (
								<section class={styles.lane} aria-labelledby={`kanban-lane-${status}`}>
									<div class={styles.laneHeader}>
										<h3 id={`kanban-lane-${status}`} class={styles.laneTitle}>
											{props.t(kanbanStatusLabels[status])}<span class={styles.count}>{items().size}</span>
										</h3>
										<div class={styles.laneActions}>
											<Button class={styles.iconButton} type="button"
												aria-label={`${props.t(isCollapsed(status) ? "kanbanExpandCategory" : "kanbanCollapseCategory")} · ${props.t(kanbanStatusLabels[status])}`}
												aria-expanded={!isCollapsed(status)} aria-controls={`kanban-content-${status}`}
												onClick={() => setStatusCollapsed(status, !isCollapsed(status))}>
												<span class={styles.collapseIcon} classList={{ [styles.collapseIconCollapsed]: isCollapsed(status) }}>
													<Icon name="chevronDown" size={15} />
												</span>
											</Button>
											<Button class={styles.iconButton} type="button"
												aria-label={`${props.t("kanbanAddItem")} · ${props.t(kanbanStatusLabels[status])}`}
												disabled={props.kanban.loading() || props.kanban.items().length >= maxKanbanItems}
												onClick={() => { setStatusCollapsed(status, false); setDraft(""); setAdding(status); }}>
												<Icon name="add" size={15} />
											</Button>
										</div>
									</div>
									<div id={`kanban-content-${status}`} class={styles.laneContent}
										classList={{ [styles.laneContentCollapsed]: isCollapsed(status) }}>
										<Show when={adding() === status}>
										<form class={styles.createForm} onSubmit={(event) => submitNew(event, status)}>
											<input class={styles.cardInput} value={draft()} maxLength={500}
												placeholder={props.t("kanbanItemPlaceholder")} aria-label={props.t("kanbanItemTitle")}
												onInput={(event) => setDraft(event.currentTarget.value)} />
											<div class={styles.formActions}>
												<Button class={styles.formButton} type="button"
													onClick={() => { setAdding(undefined); setDraft(""); }}>{props.t("cancel")}</Button>
												<Button class={styles.formButton} type="submit" disabled={!draft().trim() || props.kanban.items().length >= maxKanbanItems}>{props.t("save")}</Button>
											</div>
										</form>
										</Show>
										<div class={styles.cardList}>
										<For each={slotPositions(status)}>{(position) => {
											const item = () => items().get(position);
											const isDropTarget = () => dropTarget()?.status === status && dropTarget()?.position === position;
											return (
												<div class={styles.positionSlot} classList={{ [styles.positionSlotDropTarget]: isDropTarget() }}
													aria-hidden={item() ? undefined : "true"}
													onDragOver={(event) => {
														if (!draggedId() || !event.dataTransfer) return;
														event.preventDefault();
														event.dataTransfer.dropEffect = "move";
														setDropTarget({ status, position });
													}}
													onDragLeave={(event) => {
														if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined);
													}}
													onDrop={(event) => {
														event.preventDefault();
														event.stopPropagation();
														const itemId = event.dataTransfer?.getData("text/plain") || draggedId();
														if (itemId) props.kanban.move(itemId, status, position, item()?.id);
														setDraggedId(undefined);
														setDropTarget(undefined);
													}}>
													<Show when={item()}>{(currentItem) => renderCard(currentItem())}</Show>
												</div>
											);
										}}</For>
										</div>
									</div>
								</section>
							);
						}}</For>
					</CustomScrollArea>
				</div>
			</div>
		</aside>
	</Show>;
};

export default KanbanPanel;
