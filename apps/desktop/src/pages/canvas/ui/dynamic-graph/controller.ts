import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { readGraphState, saveGraphState } from "../../api/graph.repository";
import { ForceLayout } from "../../lib/force-layout";
import { graphEdges } from "../../lib/graph";
import type { Point, View } from "../../model/graph";
import type { ContextMenu, GraphCanvasProps } from "../graph-canvas/types";

type Gesture = { pointerId: number; target: HTMLElement; kind: "pan" | "node"; nodeId?: string;
	start: Point; origin: Point; moved: boolean; beforePositions?: Record<string, Point> };

export const useDynamicGraph = (props: GraphCanvasProps, getBoard: () => HTMLElement) => {
	const snapshot = () => ({ layout: "dynamic" as const, positions: simulation.positions() });
	const stored = readGraphState("dynamic");
	const simulation = new ForceLayout(stored.positions);
	const [positions, setPositions] = createSignal<Record<string, Point>>({});
	const [view, setView] = createSignal<View>(stored.view ?? { x: 0, y: 0, scale: 1 });
	const [hoveredId, setHoveredId] = createSignal<string>();
	const [draggedId, setDraggedId] = createSignal<string>();
	const [contextMenu, setContextMenu] = createSignal<ContextMenu>();
	const edges = createMemo(() => graphEdges(props.notes));
	const degrees = createMemo(() => {
		const result = new Map<string, number>();
		for (const edge of edges()) for (const id of [edge.source.id, edge.target.id]) result.set(id, (result.get(id) ?? 0) + 1);
		return result;
	});
	const neighbors = createMemo(() => {
		const id = hoveredId();
		const result = new Set<string>();
		if (id) {
			result.add(id);
			for (const edge of edges()) {
				if (edge.source.id === id) result.add(edge.target.id);
				if (edge.target.id === id) result.add(edge.source.id);
			}
		}
		return result;
	});
	let mounted = false;
	let frame: number | undefined;
	let lastFrame = 0;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let gesture: Gesture | undefined;
	let suppressClickUntil = 0;
	const save = () => saveGraphState({ positions: simulation.positions(), view: view() }, "dynamic");
	const scheduleSave = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 200);
	};
	const animate = (time: number): void => {
		frame = undefined;
		if (!mounted || document.hidden) return;
		if (time - lastFrame >= 16) {
			lastFrame = time;
			simulation.step();
			setPositions(simulation.positions());
		}
		if (simulation.active || draggedId()) frame = requestAnimationFrame(animate);
		else save();
	};
	const run = () => {
		if (mounted && !document.hidden && frame === undefined) frame = requestAnimationFrame(animate);
	};
	createEffect(() => {
		const changed = simulation.setGraph(props.notes.map((note) => note.id), edges().map((edge) => ({ source: edge.source.id, target: edge.target.id })));
		if (!changed) return;
		setPositions(simulation.positions());
		run();
	});

	createEffect(() => {
		const restore = props.restoration;
		if (!restore || restore.layout !== "dynamic") return;
		untrack(() => {
			finish();
			setContextMenu(undefined);
			simulation.restorePositions(restore.positions);
			setPositions(simulation.positions());
			save();
			run();
			props.onHistoryRestored();
		});
	});

	const fit = (): void => {
		if (gesture) return;
		const rect = getBoard().getBoundingClientRect();
		const points = Object.values(positions());
		if (!points.length) { setView({ x: rect.width / 2, y: rect.height / 2, scale: 1 }); return; }
		const bounds = points.reduce((result, point) => ({
			left: Math.min(result.left, point.x - 90), right: Math.max(result.right, point.x + 90),
			top: Math.min(result.top, point.y - 40), bottom: Math.max(result.bottom, point.y + 60),
		}), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
		const { left, right, top, bottom } = bounds;
		const scale = Math.max(0.15, Math.min(1.5, (rect.width - 80) / (right - left), (rect.height - 80) / (bottom - top)));
		setView({ x: rect.width / 2 - (left + right) / 2 * scale, y: rect.height / 2 - (top + bottom) / 2 * scale, scale });
		scheduleSave();
	};
	const finish = (event?: PointerEvent): void => {
		const current = gesture;
		if (!current || (event && current.pointerId !== event.pointerId)) return;
		gesture = undefined;
		if (current.nodeId) simulation.release(current.nodeId);
		setDraggedId(undefined);
		if (current.kind === "node" && current.moved && current.beforePositions)
			props.onNotesMoved({ layout: "dynamic", positions: current.beforePositions }, snapshot());
		if (current.moved) suppressClickUntil = Date.now() + 200;
		if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
		run();
		scheduleSave();
	};
	const begin = (event: PointerEvent & { currentTarget: HTMLElement }, nodeId?: string): void => {
		if (props.busy || gesture || ![0, 1, 2].includes(event.button)) return;
		if (nodeId && event.button === 2 && props.mode === "edit") {
			openMenu(event, nodeId);
			return;
		}
		event.preventDefault(); event.stopPropagation();
		setContextMenu(undefined);
		const draggingNode = nodeId && event.button === 0;
		const origin = draggingNode ? positions()[nodeId] : view();
		if (!origin) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		gesture = { pointerId: event.pointerId, target: event.currentTarget, kind: draggingNode ? "node" : "pan",
			nodeId: draggingNode ? nodeId : undefined, start: { x: event.clientX, y: event.clientY }, origin: { ...origin }, moved: false, beforePositions: draggingNode ? simulation.positions() : undefined };
		if (draggingNode) { setDraggedId(nodeId); simulation.pin(nodeId, origin); run(); }
	};
	const move = (event: PointerEvent): void => {
		const current = gesture;
		if (!current || current.pointerId !== event.pointerId) return;
		const dx = event.clientX - current.start.x;
		const dy = event.clientY - current.start.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) current.moved = true;
		if (!current.moved) return;
		if (current.kind === "pan") setView((previous) => ({ ...previous, x: current.origin.x + dx, y: current.origin.y + dy }));
		else if (current.nodeId) {
			simulation.pin(current.nodeId, { x: current.origin.x + dx / view().scale, y: current.origin.y + dy / view().scale });
			setPositions(simulation.positions()); run();
		}
	};
	const end = (event: PointerEvent): void => {
		const current = gesture;
		if (!current || current.pointerId !== event.pointerId) return;
		move(event);
		const createNote = current.kind === "pan" && !current.moved && event.button === 0 && props.mode === "edit";
		finish(event);
		if (createNote) {
			const beforeCreation = snapshot();
			void props.onCreateNote().then((note) => {
				if (note && mounted) props.onNoteCreated(note, beforeCreation, snapshot());
			});
		}
	};
	const zoom = (scale: number, x: number, y: number): void => {
		if (gesture) return;
		const previous = view();
		const next = Math.max(0.15, Math.min(2.5, scale));
		setView({ x: x - (x - previous.x) / previous.scale * next, y: y - (y - previous.y) / previous.scale * next, scale: next });
		scheduleSave();
	};
	const wheel = (event: WheelEvent): void => {
		event.preventDefault();
		const rect = getBoard().getBoundingClientRect();
		const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
		zoom(view().scale * Math.exp(-delta * 0.001), event.clientX - rect.left, event.clientY - rect.top);
	};
	const zoomBy = (factor: number): void => {
		const rect = getBoard().getBoundingClientRect();
		zoom(view().scale * factor, rect.width / 2, rect.height / 2);
	};
	const openMenu = (event: MouseEvent, noteId: string): void => {
		event.preventDefault(); event.stopPropagation();
		if (props.busy || props.mode !== "edit") return;
		const rect = getBoard().getBoundingClientRect();
		setContextMenu({ noteId, x: Math.max(8, Math.min(rect.width - 160, event.clientX - rect.left)), y: Math.max(8, Math.min(rect.height - 90, event.clientY - rect.top)) });
	};
	onMount(() => {
		mounted = true;
		props.onRegisterHistory(snapshot);
		if (!stored.view || props.centerOnMount) fit();
		props.onCanvasMount();
		run();
		const visibility = () => {
			if (document.hidden) { finish(); if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; }
			else if (simulation.active) run();
		};
		const blur = () => finish();
		const outside = (event: PointerEvent) => {
			if (!(event.target instanceof Element) || !event.target.closest(".graph-context-menu")) setContextMenu(undefined);
		};
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { finish(); setContextMenu(undefined); } };
		const resize = new ResizeObserver(() => { if (!props.notes.length) fit(); });
		resize.observe(getBoard());
		document.addEventListener("visibilitychange", visibility);
		window.addEventListener("blur", blur);
		window.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", escape);
		onCleanup(() => {
			finish();
			mounted = false;
			props.onRegisterHistory(undefined);
			if (frame !== undefined) cancelAnimationFrame(frame);
			clearTimeout(saveTimer); save(); resize.disconnect();
			document.removeEventListener("visibilitychange", visibility);
			window.removeEventListener("blur", blur);
			window.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", escape);
		});
	});
	return { positions, view, edges, neighbors, hoveredId, setHoveredId, draggedId, degrees, contextMenu, setContextMenu,
		fit, begin, move, end, finish, wheel, zoomBy, openMenu, shouldIgnoreClick: () => Date.now() < suppressClickUntil };
};
