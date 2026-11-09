import { createEffect, createMemo, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Dropdown from "@/shared/ui/dropdown";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import Icon from "@/shared/ui/icon";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { displayNoteTitle, normalizeNoteTitle, NOTE_TITLE_MAX_LENGTH, type NotesLibrary, type NoteSummary } from "@/entities/note";
import { Portal } from "solid-js/web";
import type { TranslationKey } from "@/shared/lib/i18n";
import { clampKanbanPanelWidth, getKanbanLayoutColumnCount, getKanbanPanelSnapPoints, getKanbanPanelStage, getKanbanPanelWidthLimits, resizeKanbanPanelForViewport, snapKanbanPanelWidth } from "../../model/panel-size";
import { kanbanPriorityLabels, kanbanPriorities, kanbanStatusLabels, kanbanStatuses, maxKanbanItems, type KanbanItem, type KanbanPriority, type KanbanStatus } from "../../model/kanban";
import type { useKanban } from "../../model/controller";
import { styles } from "./style.css.ts";

type Props = {
	kanban: ReturnType<typeof useKanban>;
	notes: NotesLibrary;
	vaultId?: string;
	t: (key: TranslationKey) => string;
	onOpenNote: (note: NoteSummary) => void | Promise<void>;
	onCreateNote: (title: string) => Promise<NoteSummary | undefined>;
};

const currentDateKey = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const getDaysUntilDueDate = (value: string) => {
	const today = Date.parse(`${currentDateKey()}T00:00:00.000Z`);
	const dueDate = Date.parse(`${value}T00:00:00.000Z`);
	return Math.round((dueDate - today) / 86_400_000);
};

const KanbanPanel: Component<Props> = (props) => {
	const presence = createPresence(props.kanban.open, 210);
	const { adding, setAdding, draft, setDraft, collapsedStatuses, setCollapsedStatuses } = props.kanban.view;
	const [canResize, setCanResize] = createSignal(false);
	const [viewportWidth, setViewportWidth] = createSignal(0);
	const [draggedId, setDraggedId] = createSignal<string>();
	const [draggedHeight, setDraggedHeight] = createSignal(56);
	const [dropTarget, setDropTarget] = createSignal<{ status: KanbanStatus; position: number }>();
	const [searchText, setSearchText] = createSignal("");
	const [priorityFilter, setPriorityFilter] = createSignal<KanbanPriority | "all">("all");
	const [detailsId, setDetailsId] = createSignal<string>();
	const [titleDraft, setTitleDraft] = createSignal("");
	const [noteIdDraft, setNoteIdDraft] = createSignal<string | null>(null);
	const [noteQueryDraft, setNoteQueryDraft] = createSignal("");
	const [notePickerOpen, setNotePickerOpen] = createSignal(false);
	const [noteOptionsPosition, setNoteOptionsPosition] = createSignal({ left: 0, top: 0, width: 180, maxHeight: 180 });
	const [savingDetails, setSavingDetails] = createSignal(false);
	const [noteLinkError, setNoteLinkError] = createSignal(false);
	const [priorityDraft, setPriorityDraft] = createSignal<KanbanPriority>("low");
	const [labelsDraft, setLabelsDraft] = createSignal("");
	const [dueDateDraft, setDueDateDraft] = createSignal("");
	const [wipEditorStatus, setWipEditorStatus] = createSignal<KanbanStatus>();
	const detailHeadingId = createUniqueId();
	let panelElement: HTMLElement | undefined;
	let notePickerInput: HTMLInputElement | undefined;
	let wipInputElement: HTMLInputElement | undefined;
	let resizePointer: { pointerId: number; startX: number; startWidth: number } | undefined;
	let cardDrag: {
		pointerId: number;
		itemId: string;
		startX: number;
		startY: number;
		height: number;
		width: number;
		offsetX: number;
		offsetY: number;
		source: HTMLElement;
		preview?: HTMLElement;
	} | undefined;
	let suppressCardClick = false;
	let suppressCardClickFrame: number | undefined;
	let noteOptionsFrame: number | undefined;
	const mutationsBlocked = () => props.kanban.loading() || props.kanban.readFailed();
	const layoutColumnCount = createMemo(() => getKanbanLayoutColumnCount(props.kanban.panelStage()));
	const filtering = () => Boolean(searchText().trim()) || priorityFilter() !== "all";
	const noteForId = (noteId: string | null | undefined) => noteId ? props.notes.notes().find(note => note.id === noteId) : undefined;
	const filteredItems = createMemo(() => {
		const query = searchText().trim().toLocaleLowerCase();
		return props.kanban.items().filter(item =>
			(priorityFilter() === "all" || item.priority === priorityFilter())
			&& (!query || [item.title, noteForId(item.noteId) ? displayNoteTitle(noteForId(item.noteId)!) : "", ...item.labels].some(value => value.toLocaleLowerCase().includes(query))),
		);
	});
	const selectedItem = createMemo(() => props.kanban.items().find(item => item.id === detailsId()));
	const detailPresence = createPresence(() => Boolean(detailsId()), 210);
	const displayedItem = createMemo<KanbanItem | undefined>((previous) =>
		selectedItem() ?? (detailPresence.present() ? previous : undefined),
	);
	const matchingNotes = () => {
		const query = normalizeNoteTitle(noteQueryDraft());
		return props.notes.sortedNotes().filter(note => !query
			|| normalizeNoteTitle(note.title).includes(query)
			|| normalizeNoteTitle(displayNoteTitle(note)).includes(query)).slice(0, 10);
	};
	const exactNotes = () => {
		const query = normalizeNoteTitle(noteQueryDraft().trim());
		return query ? props.notes.notes().filter(note => normalizeNoteTitle(note.title) === query) : [];
	};
	const canCreateNote = () => {
		const title = noteQueryDraft().trim();
		return Boolean(title) && title.length <= NOTE_TITLE_MAX_LENGTH && !noteIdDraft() && exactNotes().length === 0;
	};
	const updateNoteOptionsPosition = () => {
		const input = notePickerInput;
		if (!input?.isConnected) return;
		const bounds = input.getBoundingClientRect();
		const margin = 8;
		const below = window.innerHeight - bounds.bottom - margin;
		const above = bounds.top - margin;
		const requestedHeight = Math.min(240, Math.max(36, matchingNotes().length * 34 + (canCreateNote() ? 35 : 0) + 2));
		const opensBelow = below >= requestedHeight || below >= above;
		const maxHeight = Math.max(0, Math.min(requestedHeight, opensBelow ? below : above));
		const top = opensBelow ? bounds.bottom + 4 : bounds.top - 4 - maxHeight;
		const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - bounds.width - margin));
		setNoteOptionsPosition({ left, top, width: bounds.width, maxHeight });
	};
	const scheduleNoteOptionsPosition = () => {
		if (noteOptionsFrame !== undefined) cancelAnimationFrame(noteOptionsFrame);
		noteOptionsFrame = requestAnimationFrame(() => {
			noteOptionsFrame = undefined;
			if (notePickerOpen()) updateNoteOptionsPosition();
		});
	};
	const openDetails = (item: KanbanItem) => {
		setDetailsId(item.id);
		setTitleDraft(item.title);
		setNoteIdDraft(item.noteId);
		setNoteQueryDraft(noteForId(item.noteId) ? displayNoteTitle(noteForId(item.noteId)!) : item.noteId ? props.notes.referenceTitles()[item.noteId] ?? "" : "");
		setNotePickerOpen(false);
		setNoteLinkError(false);
		setPriorityDraft(item.priority === "none" ? "low" : item.priority);
		setLabelsDraft(item.labels.join(", "));
		setDueDateDraft(item.dueDate ?? "");
	};
	const closeDetails = () => {
		if (savingDetails()) return;
		setDetailsId(undefined);
		setNotePickerOpen(false);
	};
	const detailBackdropDismiss = createBackdropDismiss(closeDetails);
	const finishWipEditor = (status: KanbanStatus, input: HTMLInputElement) => {
		if (wipEditorStatus() !== status) return;
		const value = input.valueAsNumber;
		props.kanban.setWipLimit(status, Number.isNaN(value) || value === 0 ? undefined : value);
		setWipEditorStatus(undefined);
	};
	const commitWipEditorOutside = (event: PointerEvent) => {
		const status = wipEditorStatus();
		const input = wipInputElement;
		if (!status || !input || event.target === input || event.target instanceof Node && input.contains(event.target)) return;
		finishWipEditor(status, input);
	};
	const parsedLabels = () => labelsDraft().split(",").map(label => label.trim()).filter(Boolean);
	const detailsValid = () => {
		const labels = parsedLabels();
		return Boolean(titleDraft().trim()) && titleDraft().trim().length <= 500
			&& (noteIdDraft() !== null || noteQueryDraft().trim().length <= NOTE_TITLE_MAX_LENGTH) && labels.length <= 8
			&& labels.every(label => label.length <= 32) && new Set(labels).size === labels.length;
	};
	const saveDetails = async (event?: SubmitEvent, forceCreateNote = false) => {
		event?.preventDefault();
		const item = selectedItem();
		if (!item || mutationsBlocked() || savingDetails() || !detailsValid()) return;
		const itemId = item.id;
		const vaultId = props.kanban.activeVaultId();
		setSavingDetails(true);
		setNoteLinkError(false);
		try {
			let noteId = noteIdDraft() && props.notes.notes().some(note => note.id === noteIdDraft()) ? noteIdDraft() : null;
			const noteTitle = noteQueryDraft().trim();
			if (forceCreateNote) noteId = null;
			if (!noteId && noteTitle) {
				const exact = forceCreateNote ? [] : exactNotes();
				if (exact.length > 1) {
					setNoteLinkError(true);
					setNotePickerOpen(true);
					return;
				}
				if (exact.length === 1) noteId = exact[0]!.id;
				else {
					if (noteTitle.length > NOTE_TITLE_MAX_LENGTH || props.notes.loading()) {
						setNoteLinkError(true);
						return;
					}
					const created = await props.onCreateNote(noteTitle);
					if (!created) {
						setNoteLinkError(true);
						return;
					}
					noteId = created.id;
				}
			}
			if (vaultId !== props.kanban.activeVaultId() || detailsId() !== itemId
				|| !props.kanban.items().some(current => current.id === itemId)) return;
			props.kanban.update(itemId, {
				title: titleDraft(), noteId, priority: priorityDraft(),
				labels: parsedLabels(), dueDate: dueDateDraft() || null,
			});
			setDetailsId(undefined);
			setNotePickerOpen(false);
		} catch (error) {
			console.error(error);
			setNoteLinkError(true);
		} finally { setSavingDetails(false); }
	};
	const deleteCard = (item: KanbanItem) => { props.kanban.remove(item.id); };
	createEffect(on(props.kanban.activeVaultId, () => {
		setSearchText("");
		setPriorityFilter("all");
		setDetailsId(undefined);
		setWipEditorStatus(undefined);
	}, { defer: false }));
	createEffect(() => {
		document.documentElement.classList.toggle(styles.dragging, Boolean(draggedId()));
	});
	const setSnappedPanelWidth = (width: number, nextViewportWidth: number) => {
		const nextWidth = snapKanbanPanelWidth(width, nextViewportWidth);
		props.kanban.setPanelWidth(nextWidth);
		props.kanban.setPanelStage(getKanbanPanelStage(nextWidth, nextViewportWidth));
	};
	const updatePanelBounds = () => {
		const nextViewportWidth = window.innerWidth;
		const previousViewportWidth = viewportWidth();
		const { minWidth, maxWidth } = getKanbanPanelWidthLimits(nextViewportWidth);
		setViewportWidth(nextViewportWidth);
		setCanResize(getKanbanPanelSnapPoints(minWidth, maxWidth).length > 1);
		const resized = previousViewportWidth > 0
			? resizeKanbanPanelForViewport(props.kanban.panelWidth(), props.kanban.panelStage(), previousViewportWidth, nextViewportWidth)
			: {
				width: clampKanbanPanelWidth(props.kanban.panelWidth(), nextViewportWidth),
				stage: getKanbanPanelStage(props.kanban.panelWidth(), nextViewportWidth),
			};
		props.kanban.setPanelWidth(resized.width);
		props.kanban.setPanelStage(resized.stage);
	};
	const beginResize = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
		if (event.button !== 0 || !canResize()) return;
		event.preventDefault();
		event.stopPropagation();
		resizePointer = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startWidth: panelElement?.getBoundingClientRect().width ?? props.kanban.panelWidth(),
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const moveResize = (event: PointerEvent) => {
		if (!resizePointer || resizePointer.pointerId !== event.pointerId) return;
		event.preventDefault();
		setSnappedPanelWidth(
			resizePointer.startWidth + event.clientX - resizePointer.startX,
			window.innerWidth,
		);
	};
	const finishResize = (event: PointerEvent) => {
		if (!resizePointer || resizePointer.pointerId !== event.pointerId) return;
		resizePointer = undefined;
		setSnappedPanelWidth(props.kanban.panelWidth(), window.innerWidth);
	};
	onMount(() => {
		updatePanelBounds();
		window.addEventListener("resize", updatePanelBounds);
		window.addEventListener("resize", scheduleNoteOptionsPosition);
		document.addEventListener("scroll", scheduleNoteOptionsPosition, true);
		document.addEventListener("pointerdown", commitWipEditorOutside, true);
		const escape = (event: KeyboardEvent) => {
			if (!detailsId() || event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			closeDetails();
		};
		window.addEventListener("keydown", escape, true);
		onCleanup(() => {
			window.removeEventListener("resize", updatePanelBounds);
			window.removeEventListener("resize", scheduleNoteOptionsPosition);
			document.removeEventListener("scroll", scheduleNoteOptionsPosition, true);
			document.removeEventListener("pointerdown", commitWipEditorOutside, true);
			window.removeEventListener("keydown", escape, true);
		});
	});

	const laneItems = (status: KanbanStatus) => props.kanban.items().filter(item => item.status === status);
	const visibleLaneItems = (status: KanbanStatus) => filteredItems()
		.filter(item => item.status === status)
		.sort((left, right) => left.position - right.position);
	const getDropPosition = (lane: HTMLElement, clientY: number) => {
		const cards = [...lane.querySelectorAll<HTMLElement>("[data-kanban-card]")]
			.filter(card => card.dataset.kanbanCard !== draggedId());
		let low = 0;
		let high = cards.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const rect = cards[middle]!.getBoundingClientRect();
			if (clientY < rect.top + rect.height / 2) high = middle;
			else low = middle + 1;
		}
		return low;
	};
	const isCollapsed = (status: KanbanStatus) => collapsedStatuses().has(status);
	const finishDrag = () => {
		if (cardDrag) {
			window.removeEventListener("pointermove", moveCardDrag, true);
			window.removeEventListener("pointerup", finishCardDrag, true);
			window.removeEventListener("pointercancel", cancelCardDrag, true);
			window.removeEventListener("blur", cancelDragOnBlur);
			cardDrag.preview?.remove();
		}
		cardDrag = undefined;
		setDraggedId(undefined);
		setDropTarget(undefined);
	};
	const updateDropTargetAt = (clientX: number, clientY: number) => {
		if (!draggedId() || filtering() || mutationsBlocked()) {
			setDropTarget(undefined);
			return;
		}
		const lane = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-kanban-lane]");
		const status = lane?.dataset.kanbanLane as KanbanStatus | undefined;
		if (!lane || !status || !kanbanStatuses.includes(status) || !panelElement?.contains(lane) || isCollapsed(status)) {
			setDropTarget(undefined);
			return;
		}
		const position = getDropPosition(lane, clientY);
		setDropTarget(current => current?.status === status && current.position === position ? current : { status, position });
	};
	const moveCardDrag = (event: PointerEvent) => {
		const drag = cardDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (!draggedId()) {
			if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
			if (filtering() || mutationsBlocked()) {
				finishDrag();
				return;
			}
			drag.preview = drag.source.cloneNode(true) as HTMLElement;
			drag.preview.classList.add(styles.dragPreview);
			drag.preview.style.left = `${event.clientX - drag.offsetX}px`;
			drag.preview.style.top = `${event.clientY - drag.offsetY}px`;
			drag.preview.style.width = `${drag.width}px`;
			document.body.append(drag.preview);
			setDraggedHeight(drag.height);
			setDropTarget(undefined);
			setDraggedId(drag.itemId);
		}
		event.preventDefault();
		if (drag.preview) {
			drag.preview.style.left = `${event.clientX - drag.offsetX}px`;
			drag.preview.style.top = `${event.clientY - drag.offsetY}px`;
		}
		updateDropTargetAt(event.clientX, event.clientY);
	};
	const finishCardDrag = (event: PointerEvent) => {
		const drag = cardDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (draggedId()) {
			updateDropTargetAt(event.clientX, event.clientY);
			const target = dropTarget();
			if (target && !filtering() && !mutationsBlocked()) props.kanban.move(drag.itemId, target.status, target.position);
			suppressCardClick = true;
			if (suppressCardClickFrame !== undefined) cancelAnimationFrame(suppressCardClickFrame);
			suppressCardClickFrame = requestAnimationFrame(() => {
				suppressCardClick = false;
				suppressCardClickFrame = undefined;
			});
		}
		finishDrag();
	};
	const cancelCardDrag = (event: PointerEvent) => {
		if (cardDrag?.pointerId === event.pointerId) finishDrag();
	};
	const cancelDragOnBlur = () => finishDrag();
	const startDrag = (event: PointerEvent & { currentTarget: HTMLElement }, item: KanbanItem) => {
		if (event.button !== 0 || event.isPrimary === false || filtering() || mutationsBlocked() || cardDrag
			|| (event.target instanceof Element && event.target.closest("button"))) return;
		const rect = event.currentTarget.getBoundingClientRect();
		cardDrag = {
			pointerId: event.pointerId, itemId: item.id, startX: event.clientX, startY: event.clientY,
			height: rect.height, width: rect.width, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
			source: event.currentTarget,
		};
		window.addEventListener("pointermove", moveCardDrag, { capture: true, passive: false });
		window.addEventListener("pointerup", finishCardDrag, true);
		window.addEventListener("pointercancel", cancelCardDrag, true);
		window.addEventListener("blur", cancelDragOnBlur);
	};
	onCleanup(() => {
		finishDrag();
		document.documentElement.classList.remove(styles.dragging);
		if (suppressCardClickFrame !== undefined) cancelAnimationFrame(suppressCardClickFrame);
		if (noteOptionsFrame !== undefined) cancelAnimationFrame(noteOptionsFrame);
	});
	const laneClass: Record<KanbanStatus, string> = {
		backlog: styles.laneBacklog,
		toDo: styles.laneToDo,
		inProgress: styles.laneInProgress,
		review: styles.laneReview,
		finish: styles.laneFinish,
	};
	const setStatusCollapsed = (status: KanbanStatus, collapsed: boolean) => setCollapsedStatuses(current => {
		if (current.has(status) === collapsed) return current;
		const next = new Set(current);
		if (collapsed) next.add(status);
		else next.delete(status);
		return next;
	});
	const submitNew = (event: SubmitEvent, status: KanbanStatus) => {
		event.preventDefault();
		if (mutationsBlocked() || !draft().trim()) return;
		props.kanban.add(draft(), status);
		setDraft("");
		setAdding(undefined);
	};
	const renderCard = (item: KanbanItem) => {
		return (
			<article class={styles.card} classList={{ [styles.draggedSource]: draggedId() === item.id, [styles.cardNoDrag]: filtering() }}
				data-kanban-card={item.id}
				draggable={false}
				onPointerDown={event => startDrag(event, item)}
				onClick={() => {
					if (suppressCardClick) {
						suppressCardClick = false;
						if (suppressCardClickFrame !== undefined) cancelAnimationFrame(suppressCardClickFrame);
						suppressCardClickFrame = undefined;
						return;
					}
					openDetails(item);
				}}>
				<div class={styles.cardTop}>
					<Show when={item.priority !== "none"}>
						<span class={`${styles.priorityBadge} ${item.priority === "low" ? styles.priorityLow : item.priority === "medium" ? styles.priorityMedium : styles.priorityHigh}`}>
							{props.t(kanbanPriorityLabels[item.priority])}
						</span>
					</Show>
					<div class={styles.cardTitle}>{item.title}</div>
					<Show when={item.dueDate}>{dueDate => {
						const daysUntilDueDate = getDaysUntilDueDate(dueDate());
						const overdue = daysUntilDueDate < 0 && item.status !== "finish";
						return <span class={`${styles.dueBadge} ${overdue ? styles.dueOverdue : ""}`}>
							{daysUntilDueDate}
						</span>;
					}}</Show>
				</div>
				<Show when={item.noteId && !props.notes.loading()}>
					<Show when={noteForId(item.noteId)} fallback={
						<span class={styles.cardNoteUnavailable}>{props.notes.referenceTitles()[item.noteId!] ?? props.t("kanbanNoteUnavailable")}</span>
					}>
						{note => <Button class={styles.cardNote} type="button" onClick={event => {
							event.stopPropagation();
							void props.onOpenNote(note());
						}}><Icon name="link" size={11} />{displayNoteTitle(note())}</Button>}
					</Show>
				</Show>
				<Show when={item.labels.length}><div class={styles.cardLabels}>
					<For each={item.labels}>{label => <span class={styles.cardLabel}>{label}</span>}</For>
				</div></Show>
			</article>
		);
	};

	return <Show when={presence.present()}>
		<aside id="kanban-panel" class={styles.panel}
			style={{ width: `${props.kanban.panelWidth()}px` }} aria-labelledby="kanban-heading"
			inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
			ref={(element) => { panelElement = element; registerVisibilityAnimation(element, presence.exiting, "panel-left"); }}
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
								if (detailsId()) closeDetails();
				else props.kanban.setOpen(false);
			}}>
			<AsciiBackdrop placement="modal" />
			<div class={styles.resizeHandle} classList={{ [styles.resizeHandleDisabled]: !canResize() }}
				onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={finishResize}
				onPointerCancel={finishResize} onLostPointerCapture={finishResize} />
			<div class={styles.body}>
				<header class={styles.header}>
					<h2 id="kanban-heading" class={styles.title}>{props.t("kanbanTitle")}</h2>
					<Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={() => props.kanban.setOpen(false)}>
						<Icon name="close" size={15} />
					</Button>
				</header>
				<div class={styles.content}>
					<div class={styles.toolbar}>
						<label class={styles.searchBox}>
							<Icon name="search" size={14} />
							<input class={styles.searchInput} type="search" value={searchText()} placeholder={props.t("kanbanSearch")}
								onInput={event => setSearchText(event.currentTarget.value)} />
						</label>
						<Dropdown ariaLabel={props.t("kanbanPriority")} value={priorityFilter()}
							style={{ width: "142px", "max-width": "40%", "flex-shrink": 0 }}
							options={[
								{ value: "all", label: props.t("kanbanPriorityAll") },
								...kanbanPriorities.filter(priority => priority !== "none").map(priority => ({ value: priority, label: props.t(kanbanPriorityLabels[priority]) })),
							]}
							onChange={value => setPriorityFilter(value as KanbanPriority | "all")} />
					</div>
					<Show when={props.kanban.error() || props.kanban.readFailed()}>
						<div class={styles.formActions} style={{ "align-items": "center" }}>
							<p class={styles.error} role="alert">{props.t("kanbanStorageFailed")}</p>
							<Show when={props.kanban.readFailed()}>
								<Button class={styles.formButton} type="button" disabled={props.kanban.loading()} onClick={props.kanban.retryRead}>{props.t("retry")}</Button>
							</Show>
						</div>
					</Show>
					<Show when={props.kanban.items().length >= maxKanbanItems}><p class={styles.loading} role="status">{props.t("kanbanLimitReached")}</p></Show>
					<Show when={props.kanban.loading()}><p class={styles.loading}>{props.t("kanbanLoading")}</p></Show>
					<Show when={!filtering() || filteredItems().length > 0} fallback={<p class={styles.noResults}>{props.t("kanbanNoSearchResults")}</p>}>
						<CustomScrollArea ariaLabel={props.t("kanbanTitle")} class={styles.kanbanScrollArea}
							contentClass={`${styles.lanes} ${layoutColumnCount() === 5 ? styles.lanesFive : ""}`}
							viewportStyle={{ padding: "2px 12px 12px" }}>
							<For each={kanbanStatuses}>{(status) => {
								const count = () => laneItems(status).length;
								const remainingItems = () => visibleLaneItems(status).filter(item => item.id !== draggedId());
								const dropPlaceholder = () => <div class={styles.dropPlaceholder} style={{ height: `${draggedHeight()}px` }} />;
								const wipLimit = () => props.kanban.wipLimits()[status];
								const exceeded = () => wipLimit() !== undefined && count() > wipLimit()!;
								return (
									<section class={`${styles.lane} ${laneClass[status]}`} aria-labelledby={`kanban-lane-${status}`}
										data-kanban-lane={status}>
										<div class={styles.laneHeader}>
										<h3 id={`kanban-lane-${status}`} class={styles.laneTitle}>
											{props.t(kanbanStatusLabels[status])}
											<Show when={wipEditorStatus() === status} fallback={
												<Button class={styles.count} classList={{ [styles.countExceeded]: exceeded() }} type="button"
													sound={false}
													onClick={() => setWipEditorStatus(status)}>
													{count()}{wipLimit() === undefined ? "" : ` / ${wipLimit()}`}
												</Button>
											}>
												<input class={styles.wipInput} classList={{ [styles.countExceeded]: exceeded() }} type="number" min="0" max={maxKanbanItems} value={wipLimit() ?? ""} placeholder="∞"
													ref={element => { wipInputElement = element; element.focus({ preventScroll: true }); element.select(); }}
													onBlur={event => finishWipEditor(status, event.currentTarget)}
													onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
											</Show>
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
													disabled={mutationsBlocked() || props.kanban.items().length >= maxKanbanItems}
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
													disabled={mutationsBlocked()} onInput={(event) => setDraft(event.currentTarget.value)} />
												<div class={styles.formActions}>
													<Button class={styles.formButton} type="button"
														onClick={() => { setAdding(undefined); setDraft(""); }}>{props.t("cancel")}</Button>
													<Button class={styles.formButton} type="submit" disabled={mutationsBlocked() || !draft().trim() || props.kanban.items().length >= maxKanbanItems}>{props.t("save")}</Button>
												</div>
											</form>
											</Show>
											<div class={styles.cardList}>
											<For each={visibleLaneItems(status)}>{item => {
												const isDragged = () => draggedId() === item.id;
												const insertionIndex = () => remainingItems().findIndex(candidate => candidate.id === item.id);
												return <>
													<Show when={!isDragged() && dropTarget()?.status === status && dropTarget()?.position === insertionIndex()}>
														{dropPlaceholder()}
													</Show>
													{renderCard(item)}
												</>;
											}}</For>
											<Show when={dropTarget()?.status === status && dropTarget()?.position === remainingItems().length}>
												{dropPlaceholder()}
											</Show>
										</div>
										</div>
									</section>
								);
							}}</For>
						</CustomScrollArea>
					</Show>
				</div>
			</div>
			<Portal mount={document.querySelector("[data-omega-app-shell]") ?? document.body}>
				<Show when={detailPresence.present() && displayedItem()}>{item =>
					<div class={styles.detailBackdrop} inert={detailPresence.exiting()} aria-hidden={detailPresence.exiting() || undefined}
						ref={element => registerVisibilityAnimation(element, detailPresence.exiting, "fade")}
						{...detailBackdropDismiss}>
						<section class={styles.detailDialog} role="dialog" aria-modal="true" aria-labelledby={detailHeadingId}
							ref={element => registerVisibilityAnimation(element, detailPresence.exiting, "dialog")}>
							<AsciiBackdrop placement="modal" />
							<header class={styles.detailHeader}>
							<h2 id={detailHeadingId} class={styles.detailTitle}>{props.t("kanbanEditItem")}</h2>
							<Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={closeDetails}><Icon name="close" size={15} /></Button>
						</header>
						<form class={styles.detailForm} onSubmit={event => void saveDetails(event)}>
							<label class={styles.detailField}><span>{props.t("kanbanItemTitle")}</span>
								<input class={styles.detailInput} value={titleDraft()} maxLength={500} disabled={savingDetails()} onInput={event => setTitleDraft(event.currentTarget.value)} />
							</label>
							<div class={styles.notePicker}>
								<label class={styles.notePickerLabel} for="kanban-note-picker">{props.t("kanbanLinkedNote")}</label>
								<input id="kanban-note-picker" class={styles.detailInput} type="search" value={noteQueryDraft()} maxLength={NOTE_TITLE_MAX_LENGTH}
									placeholder={props.t("kanbanNoteSearchOrCreate")} disabled={savingDetails() || props.notes.loading()}
									ref={element => { notePickerInput = element; }}
									onFocus={() => { setNotePickerOpen(true); scheduleNoteOptionsPosition(); }}
									onBlur={() => setNotePickerOpen(false)}
									onInput={event => {
										setNoteQueryDraft(event.currentTarget.value);
									setNoteIdDraft(null);
									setNoteLinkError(false);
									setNotePickerOpen(true);
									scheduleNoteOptionsPosition();
									}} />
								<Show when={notePickerOpen()}>
									<Portal>
										<div class={styles.noteOptions} style={{ left: `${noteOptionsPosition().left}px`, top: `${noteOptionsPosition().top}px`, width: `${noteOptionsPosition().width}px`, height: `${noteOptionsPosition().maxHeight}px` }}>
										<CustomScrollArea ariaLabel={props.t("kanbanLinkedNote")} class={styles.noteOptionsScroll}
											contentClass={styles.noteOptionList} viewportStyle={{ padding: "0 18px 0 0" }}>
											<For each={matchingNotes()}>{note => <button class={styles.noteOption} type="button"
												onPointerDown={event => event.preventDefault()}
												onClick={() => {
													setNoteIdDraft(note.id);
													setNoteQueryDraft(displayNoteTitle(note));
													setNotePickerOpen(false);
													setNoteLinkError(false);
												}}>{displayNoteTitle(note)}</button>}</For>
											<Show when={canCreateNote()}>
												<button class={`${styles.noteOption} ${styles.noteCreateOption}`} type="button" disabled={savingDetails() || props.notes.loading()}
													onPointerDown={event => event.preventDefault()}
													onClick={() => void saveDetails(undefined, true)}>
													<Icon name="add" size={13} />{props.t("kanbanCreateAndLinkNote").replace("{title}", noteQueryDraft().trim())}
												</button>
											</Show>
										</CustomScrollArea>
									</div>
								</Portal>
								</Show>
							</div>
							<Show when={noteLinkError()}><p class={styles.error}>{props.t("kanbanNoteLinkFailed")}</p></Show>
							<div class={styles.detailRow}>
								<label class={styles.detailField}><span>{props.t("kanbanPriority")}</span>
									<Dropdown ariaLabel={props.t("kanbanPriority")} value={priorityDraft()} placeholder="—" disabled={savingDetails()}
										options={kanbanPriorities.filter(priority => priority !== "none").map(priority => ({ value: priority, label: props.t(kanbanPriorityLabels[priority]) }))}
										onChange={value => setPriorityDraft(value as KanbanPriority)} />
								</label>
								<label class={styles.detailField}><span>{props.t("kanbanDueDate")}</span>
									<input class={styles.detailInput} type="date" value={dueDateDraft()} onInput={event => setDueDateDraft(event.currentTarget.value)} />
								</label>
							</div>
							<label class={styles.detailField}><span>{props.t("kanbanLabels")}</span>
								<input class={styles.detailInput} value={labelsDraft()} maxLength={270} placeholder={props.t("kanbanLabelsPlaceholder")} disabled={savingDetails()} onInput={event => setLabelsDraft(event.currentTarget.value)} />
							</label>
							<div class={styles.detailActions}>
								<Button class={`${styles.formButton} ${styles.deleteButton}`} type="button" disabled={mutationsBlocked() || savingDetails()} onClick={() => { deleteCard(item()); closeDetails(); }}>
									<Icon name="delete" size={13} />{props.t("kanbanDeleteItem")}
								</Button>
								<div class={styles.detailPrimaryActions}>
									<Button class={styles.formButton} type="button" disabled={savingDetails()} onClick={closeDetails}>{props.t("cancel")}</Button>
									<Button class={styles.formButton} type="submit" disabled={mutationsBlocked() || savingDetails() || !detailsValid()}>{props.t("save")}</Button>
								</div>
							</div>
						</form>
						</section>
					</div>
				}</Show>
			</Portal>
						</aside>
	</Show>;
};

export default KanbanPanel;
