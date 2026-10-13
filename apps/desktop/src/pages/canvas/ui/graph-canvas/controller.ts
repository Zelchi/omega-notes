import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import type { StudyNote } from "@/entities/note";
import type { ContextMenu, Gesture, PendingMove, Point, NodeSize, SelectionBox, View } from "./types";
import { defaultPosition, graphEdgePath, graphEdges, HOME_HEIGHT, HOME_WIDTH, nodeSize } from "../../lib/graph";
import { separateStaticNodes } from "../../lib/static-layout";
import { readGraphState, saveGraphState as persistGraphState } from "../../api/graph.repository";
import type { GraphCanvasProps } from "./types";

export const useGraphCanvas = (props: GraphCanvasProps, getBoard: () => HTMLDivElement) => {
	const storedState = readGraphState();
	const [positions, setPositions] = createSignal<Record<string, Point>>(storedState.positions);
	const [view, setView] = createSignal<View>(storedState.view ?? { x: 0, y: 0, scale: 1 });
	const [contextMenu, setContextMenu] = createSignal<ContextMenu>();
	const [createdNoteId, setCreatedNoteId] = createSignal<string>();
	const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set<string>());
	const [selectionBox, setSelectionBox] = createSignal<SelectionBox>();
	const [measuredSizes, setMeasuredSizes] = createSignal<Map<string, NodeSize>>(new Map());
	const nodeElements = new Map<string, HTMLButtonElement>();
	let sizeObserver: ResizeObserver | undefined;
	let pendingCreationPoint: Point | undefined;
	let previousSizes = new Map<string, NodeSize>();
	const layoutNodes = createMemo(() => props.notes.map((note) => ({ id: note.id, ...(measuredSizes().get(note.id) ?? nodeSize(note)) })));
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
		const nodes = layoutNodes();
		const current = untrack(positions);
		const addedIds = new Set<string>();
		const resizedIds = new Set(nodes.filter((node) => {
			const previous = previousSizes.get(node.id);
			return previous && (previous.width !== node.width || previous.height !== node.height);
		}).map((node) => node.id));
		previousSizes = new Map(nodes.map((node) => [node.id, node]));
		const activeIds = new Set(notes.map((note) => note.id));
		const next = Object.fromEntries(Object.entries(current).filter(([noteId]) => activeIds.has(noteId)));
		let changed = Object.keys(next).length !== Object.keys(current).length;

		notes.forEach((note, index) => {
			if (next[note.id]) return;
			const size = nodes[index];
			next[note.id] = pendingCreationPoint
				? { x: pendingCreationPoint.x - size.width / 2, y: pendingCreationPoint.y - size.height / 2 }
				: defaultPosition(index, notes.length, size);
			addedIds.add(note.id);
			changed = true;
		});

		const priority = gesture?.nodeOrigins ? new Set(Object.keys(gesture.nodeOrigins)) : new Set([...addedIds, ...resizedIds]);
		const separated = separateStaticNodes(changed ? next : current, nodes, priority);
		if (changed || separated !== current) setPositions(separated);
		setSelectedIds((current) => {
			const retained = new Set([...current].filter((id) => activeIds.has(id)));
			return retained.size === current.size ? current : retained;
		});
	});

	createEffect(() => {
		if (props.mode === "edit") return;
		setSelectedIds(new Set<string>());
		setSelectionBox(undefined);
		gesture = undefined;
	});

	onCleanup(() => {
		disposed = true;
		if (graphSaveTimer !== undefined) saveGraphState();
		clearTimeout(creationTimer);
		if (moveFrame !== undefined) cancelAnimationFrame(moveFrame);
		if (graphSaveTimer !== undefined) clearTimeout(graphSaveTimer);
	});

	onMount(() => {
		const board = getBoard();
		sizeObserver = new ResizeObserver((entries) => {
			setMeasuredSizes((current) => {
				let next = current;
				for (const entry of entries) {
					const element = entry.target as HTMLButtonElement;
					const id = element.dataset.noteId;
					if (!id || nodeElements.get(id) !== element || !element.offsetWidth || !element.offsetHeight) continue;
					const previous = current.get(id);
					if (previous?.width === element.offsetWidth && previous.height === element.offsetHeight) continue;
					if (next === current) next = new Map(current);
					next.set(id, { width: element.offsetWidth, height: element.offsetHeight });
				}
				return next;
			});
		});
		for (const element of nodeElements.values()) sizeObserver.observe(element);
		onCleanup(() => sizeObserver?.disconnect());
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
			if (event.key !== "Escape" || (!contextMenu() && !selectedIds().size && !gesture)) return;
			if (Array.from(document.querySelectorAll('[aria-modal="true"]')).some((dialog) => !dialog.closest("[inert]"))) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if (gesture?.moved && gesture.kind !== "selection") saveGraphState();
			gesture = undefined;
			setSelectionBox(undefined);
			setSelectedIds(new Set<string>());
			setContextMenu(undefined);
		};
		addEventListener("pointerdown", closeOnOutsidePointer);
		addEventListener("keydown", closeOnEscape, true);
		onCleanup(() => {
			removeEventListener("pointerdown", closeOnOutsidePointer);
			removeEventListener("keydown", closeOnEscape, true);
		});
	});

	const beginPan = (event: PointerEvent & { currentTarget: HTMLElement }): void => {
		if (gesture || (event.button !== 0 && event.button !== 1 && event.button !== 2)) return;
		event.preventDefault();
		setContextMenu(undefined);
		event.currentTarget.setPointerCapture(event.pointerId);
		const currentView = view();
		const selecting = event.button === 0 && props.mode === "edit" && event.pointerType !== "touch";
		const rect = getBoard().getBoundingClientRect();
		const nodeSizes = new Map(selecting
			? Array.from(getBoard().querySelectorAll<HTMLButtonElement>("[data-note-id]"), (element) =>
				[element.dataset.noteId!, { width: element.offsetWidth, height: element.offsetHeight }] as const)
			: []);
		gesture = {
			pointerId: event.pointerId,
			kind: selecting ? "selection" : "pan",
			startX: event.clientX,
			startY: event.clientY,
			originX: currentView.x,
			originY: currentView.y,
			button: event.button,
			selection: selecting ? {
				baseline: new Set(selectedIds()),
				additive: event.ctrlKey || event.metaKey || event.shiftKey,
				boardLeft: rect.left,
				boardTop: rect.top,
				scale: currentView.scale,
				bounds: props.notes.map((note, index) => {
					const size = nodeSizes.get(note.id) ?? nodeSize(note);
					const point = positions()[note.id] ?? defaultPosition(index, props.notes.length, nodeSize(note));
					return { id: note.id, left: point.x, top: point.y, right: point.x + size.width, bottom: point.y + size.height };
				}),
			} : undefined,
			moved: false,
		};
	};

	const beginNodeDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }, note: StudyNote): void => {
		if (gesture) return;
		if (event.button === 2 || event.button === 1) {
			event.preventDefault();
			event.stopPropagation();
			if (props.mode === "view" || event.button === 1) beginPan(event);
			else openContextMenu(event, note);
			return;
		}
		if (event.button !== 0) return;
		event.stopPropagation();
		setContextMenu(undefined);
		if (props.mode === "view") return;
		if (event.ctrlKey || event.metaKey || event.shiftKey) {
			setSelectedIds((current) => {
				const next = new Set(current);
				if (next.has(note.id)) next.delete(note.id);
				else next.add(note.id);
				return next;
			});
			return;
		}
		if (!selectedIds().has(note.id)) setSelectedIds(new Set([note.id]));
		event.currentTarget.setPointerCapture(event.pointerId);
		const nodeOrigins = Object.fromEntries(props.notes.flatMap((item, index) =>
			selectedIds().has(item.id) ? [[item.id, positions()[item.id] ?? defaultPosition(index, props.notes.length, nodeSize(item))]] : [],
		));
		gesture = {
			pointerId: event.pointerId,
			kind: "node",
			nodeOrigins,
			startX: event.clientX,
			startY: event.clientY,
			originX: 0,
			originY: 0,
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

		if (!active.moved) return;
		if (active.kind === "selection" && active.selection) {
			const selection = active.selection;
			const left = Math.min(active.startX, move.clientX);
			const top = Math.min(active.startY, move.clientY);
			const right = Math.max(active.startX, move.clientX);
			const bottom = Math.max(active.startY, move.clientY);
			setSelectionBox({ x: left - selection.boardLeft, y: top - selection.boardTop, width: right - left, height: bottom - top });
			const worldLeft = (left - selection.boardLeft - active.originX) / selection.scale;
			const worldTop = (top - selection.boardTop - active.originY) / selection.scale;
			const worldRight = (right - selection.boardLeft - active.originX) / selection.scale;
			const worldBottom = (bottom - selection.boardTop - active.originY) / selection.scale;
			const next = selection.additive ? new Set(selection.baseline) : new Set<string>();
			for (const bounds of selection.bounds) {
				if (bounds.left <= worldRight && bounds.right >= worldLeft && bounds.top <= worldBottom && bounds.bottom >= worldTop) next.add(bounds.id);
			}
			setSelectedIds(next);
			return;
		}
		if (!active.nodeOrigins || props.mode !== "edit") return;
		const priority = new Set(Object.keys(active.nodeOrigins));
		const scale = view().scale;
		setPositions((current) => {
			const next = { ...current };
			for (const [id, origin] of Object.entries(active.nodeOrigins!)) {
				if (current[id]) next[id] = { x: origin.x + dx / scale, y: origin.y + dy / scale };
			}
			return separateStaticNodes(next, layoutNodes(), priority);
		});
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
		pendingMove = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
		flushPendingMove(event.pointerId);
		const finished = gesture;
		gesture = undefined;
		setSelectionBox(undefined);

		if (finished.moved) {
			suppressClickUntil = Date.now() + 200;
			if (finished.kind !== "selection") saveGraphState();
			return;
		}
		if (finished.kind === "selection") {
			if (finished.selection?.additive) return;
			setSelectedIds(new Set<string>());
			if (finished.selection?.baseline.size) return;
		} else if (finished.kind !== "pan" || finished.button !== 0 || props.mode === "view") return;

		const rect = getBoard().getBoundingClientRect();
		const currentView = view();
		const clickPoint = {
			x: (event.clientX - rect.left - currentView.x) / currentView.scale,
			y: (event.clientY - rect.top - currentView.y) / currentView.scale,
		};
		pendingCreationPoint = clickPoint;
		void props.onCreateNote().then((note) => {
			pendingCreationPoint = undefined;
			if (!note || disposed) return;
			const size = measuredSizes().get(note.id) ?? nodeSize(note);
			const position = { x: clickPoint.x - size.width / 2, y: clickPoint.y - size.height / 2 };
			const nodes = layoutNodes();
			const nextPositions = separateStaticNodes({ ...positions(), [note.id]: position },
				nodes.some((item) => item.id === note.id) ? nodes : [...nodes, { id: note.id, ...size }], new Set([note.id]));
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
		if (gesture.kind === "selection") setSelectedIds(gesture.selection?.baseline ?? new Set<string>());
		else if (gesture.moved) saveGraphState();
		gesture = undefined;
		setSelectionBox(undefined);
	};

	const zoomTo = (scale: number, anchorX: number, anchorY: number): void => {
		if (gesture) return;
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
		registerNode: (id: string, element: HTMLButtonElement): void => {
			nodeElements.set(id, element);
			sizeObserver?.observe(element);
			onCleanup(() => {
				sizeObserver?.unobserve(element);
				if (nodeElements.get(id) === element) nodeElements.delete(id);
				setMeasuredSizes((current) => { if (!current.has(id)) return current; const next = new Map(current); next.delete(id); return next; });
			});
		},
		createdNoteId,
		selectedIds,
		selectionBox,
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
		shouldIgnoreClick: (event: MouseEvent) => Date.now() < suppressClickUntil || (props.mode === "edit" && (event.ctrlKey || event.metaKey || event.shiftKey || selectedIds().size > 1)),
		clearContextMenu: () => setContextMenu(undefined),
	};
};
