import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { StudyNote } from "@/entities/note";
import type { ContextMenu, Gesture, PendingMove, Point, View } from "./types";
import { defaultPosition, graphEdgePath, graphEdges, HOME_HEIGHT, HOME_WIDTH, nodeSize } from "../../lib/graph";
import { readGraphState, saveGraphState as persistGraphState } from "../../api/graph.repository";
import type { GraphCanvasProps } from "./types";

export const useGraphCanvas = (props: GraphCanvasProps, getBoard: () => HTMLDivElement) => {
	const storedState = readGraphState();
	const [positions, setPositions] = createSignal<Record<string, Point>>(storedState.positions);
	const [view, setView] = createSignal<View>(storedState.view ?? { x: 0, y: 0, scale: 1 });
	const [contextMenu, setContextMenu] = createSignal<ContextMenu>();
	const [createdNoteId, setCreatedNoteId] = createSignal<string>();
	let creationTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	const edges = createMemo(() => graphEdges(props.notes));

	let gesture: Gesture | undefined;
	let pendingMove: PendingMove | undefined;
	let moveFrame: number | undefined;
	let graphSaveTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressClickUntil = 0;

	const saveGraphState = (nextPositions = positions(), nextView = view()): void => {
		if (graphSaveTimer !== undefined) {
			clearTimeout(graphSaveTimer);
			graphSaveTimer = undefined;
		}
		persistGraphState({ positions: nextPositions, view: nextView });
	};

	const scheduleGraphSave = (): void => {
		if (typeof window === "undefined") return;
		if (graphSaveTimer !== undefined) clearTimeout(graphSaveTimer);
		graphSaveTimer = setTimeout(() => {
			graphSaveTimer = undefined;
			saveGraphState();
		}, 180);
	};

	createEffect(() => {
		positions();
		view();
		scheduleGraphSave();
	});

	createEffect(() => {
		const notes = props.notes;
		const current = positions();
		const activeIds = new Set(notes.map((note) => note.id));
		const next = Object.fromEntries(Object.entries(current).filter(([noteId]) => activeIds.has(noteId)));
		let changed = Object.keys(next).length !== Object.keys(current).length;

		notes.forEach((note, index) => {
			if (next[note.id]) return;
			next[note.id] = defaultPosition(index, notes.length, nodeSize(note));
			changed = true;
		});

		if (changed) setPositions(next);
	});

	onCleanup(() => {
		disposed = true;
		clearTimeout(creationTimer);
		if (moveFrame !== undefined) cancelAnimationFrame(moveFrame);
		if (graphSaveTimer !== undefined) clearTimeout(graphSaveTimer);
	});

	onMount(() => {
		const board = getBoard();
		if (props.centerOnMount) {
			const rect = board.getBoundingClientRect();
			const scale = view().scale;
			if (props.notes.length > 0) {
				const bounds = props.notes.reduce(
					(current, note, index) => {
						const size = nodeSize(note);
						const point = positions()[note.id] ?? defaultPosition(index, props.notes.length, size);
						return {
							left: Math.min(current.left, point.x),
							top: Math.min(current.top, point.y),
							right: Math.max(current.right, point.x + size.width),
							bottom: Math.max(current.bottom, point.y + size.height),
						};
					},
					{ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
				);
				const centerX = (bounds.left + bounds.right) / 2;
				const centerY = (bounds.top + bounds.bottom) / 2;
				setView({ x: rect.width / 2 - centerX * scale, y: rect.height / 2 - centerY * scale, scale });
			} else {
				setView({ x: rect.width / 2 - HOME_WIDTH / 2, y: rect.height / 2 - HOME_HEIGHT / 2, scale });
			}
		}
		props.onCanvasMount();

		const closeOnOutsidePointer = (event: PointerEvent) => {
			if (!(event.target instanceof Element) || !event.target.closest(".graph-context-menu"))
				setContextMenu(undefined);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && contextMenu()) setContextMenu(undefined);
		};
		addEventListener("pointerdown", closeOnOutsidePointer);
		addEventListener("keydown", closeOnEscape);
		onCleanup(() => {
			removeEventListener("pointerdown", closeOnOutsidePointer);
			removeEventListener("keydown", closeOnEscape);
		});
	});

	const beginPan = (event: PointerEvent & { currentTarget: HTMLElement }): void => {
		if (event.button !== 0 && event.button !== 2) return;
		event.preventDefault();
		setContextMenu(undefined);
		event.currentTarget.setPointerCapture(event.pointerId);
		const currentView = view();
		gesture = {
			pointerId: event.pointerId,
			kind: "pan",
			startX: event.clientX,
			startY: event.clientY,
			originX: currentView.x,
			originY: currentView.y,
			button: event.button,
			moved: false,
		};
	};

	const beginNodeDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }, note: StudyNote): void => {
		if (event.button === 2) {
			event.preventDefault();
			event.stopPropagation();
			if (props.mode === "view") beginPan(event);
			else openContextMenu(event, note);
			return;
		}
		if (event.button !== 0) return;
		event.stopPropagation();
		setContextMenu(undefined);
		if (props.mode === "view") return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const point = positions()[note.id] ?? defaultPosition(0, props.notes.length, nodeSize(note));
		gesture = {
			pointerId: event.pointerId,
			kind: "node",
			nodeId: note.id,
			startX: event.clientX,
			startY: event.clientY,
			originX: point.x,
			originY: point.y,
			button: event.button,
			moved: false,
		};
	};

	const applyGestureMove = (move: PendingMove): void => {
		const active = gesture;
		if (!active || active.pointerId !== move.pointerId) return;
		const dx = move.clientX - active.startX;
		const dy = move.clientY - active.startY;
		if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;

		if (active.kind === "pan") {
			setView((current) => ({ ...current, x: active.originX + dx, y: active.originY + dy }));
			return;
		}

		const nodeId = active.nodeId;
		if (!nodeId || props.mode !== "edit") return;
		const scale = view().scale;
		setPositions((current) => ({
			...current,
			[nodeId]: { x: active.originX + dx / scale, y: active.originY + dy / scale },
		}));
	};

	const flushPendingMove = (pointerId: number): void => {
		if (!pendingMove || pendingMove.pointerId !== pointerId) return;
		if (moveFrame !== undefined) cancelAnimationFrame(moveFrame);
		moveFrame = undefined;
		const latest = pendingMove;
		pendingMove = undefined;
		applyGestureMove(latest);
	};

	const moveGesture = (event: PointerEvent): void => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		pendingMove = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
		if (moveFrame !== undefined) return;
		moveFrame = requestAnimationFrame(() => {
			moveFrame = undefined;
			const latest = pendingMove;
			pendingMove = undefined;
			if (latest) applyGestureMove(latest);
		});
	};

	const endGesture = (event: PointerEvent): void => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		flushPendingMove(event.pointerId);
		const finished = gesture;
		gesture = undefined;

		if (finished.moved) {
			suppressClickUntil = Date.now() + 200;
			saveGraphState();
			return;
		}
		if (finished.kind !== "pan" || finished.button === 2 || props.mode === "view") return;

		const rect = getBoard().getBoundingClientRect();
		const currentView = view();
		const clickPoint = {
			x: (event.clientX - rect.left - currentView.x) / currentView.scale,
			y: (event.clientY - rect.top - currentView.y) / currentView.scale,
		};
		void props.onCreateNote().then((note) => {
			if (!note || disposed) return;
			const size = nodeSize(note);
			const position = { x: clickPoint.x - size.width / 2, y: clickPoint.y - size.height / 2 };
			const nextPositions = { ...positions(), [note.id]: position };
			setPositions(nextPositions);
			setCreatedNoteId(note.id);
			clearTimeout(creationTimer);
			creationTimer = setTimeout(() => setCreatedNoteId(undefined), 480);
			saveGraphState(nextPositions);
		});
	};

	const cancelGesture = (event: PointerEvent): void => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		flushPendingMove(event.pointerId);
		if (gesture.moved) saveGraphState();
		gesture = undefined;
	};

	const zoomTo = (scale: number, anchorX: number, anchorY: number): void => {
		const current = view();
		const nextScale = Math.max(0.55, Math.min(1.5, scale));
		const worldX = (anchorX - current.x) / current.scale;
		const worldY = (anchorY - current.y) / current.scale;
		setView({ x: anchorX - worldX * nextScale, y: anchorY - worldY * nextScale, scale: nextScale });
	};

	const zoomBy = (amount: number): void => {
		const rect = getBoard().getBoundingClientRect();
		zoomTo(view().scale + amount, rect.width / 2, rect.height / 2);
	};

	const zoomWithWheel = (event: WheelEvent): void => {
		event.preventDefault();
		const rect = getBoard().getBoundingClientRect();
		const delta =
			event.deltaY *
			(event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? rect.height
					: 1);
		zoomTo(view().scale * Math.exp(-delta * 0.001), event.clientX - rect.left, event.clientY - rect.top);
	};

	const openContextMenu = (event: MouseEvent, note: StudyNote): void => {
		event.preventDefault();
		event.stopPropagation();
		if (props.mode !== "edit") return;
		const rect = getBoard().getBoundingClientRect();
		setContextMenu({
			noteId: note.id,
			x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 168)),
			y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 92)),
		});
	};

	return {
		createdNoteId,
		positions,
		view,
		contextMenu,
		setContextMenu,
		edges,
		nodePosition: (note: StudyNote, index: number) =>
			positions()[note.id] ?? defaultPosition(index, props.notes.length, nodeSize(note)),
		edgePath: (edge: ReturnType<typeof edges>[number]) => graphEdgePath(edge, positions(), props.notes.length),
		beginPan,
		beginNodeDrag,
		moveGesture,
		endGesture,
		cancelGesture,
		zoomWithWheel,
		zoomBy,
		openContextMenu,
		shouldIgnoreClick: () => Date.now() < suppressClickUntil,
		clearContextMenu: () => setContextMenu(undefined),
	};
};
