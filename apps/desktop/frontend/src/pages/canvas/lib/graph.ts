import {
	createNoteTitleIndex,
	displayNoteTitle,
	normalizeNoteTitle,
	resolveNoteReference,
	type NoteSummary,
} from "@/entities/note";
import type { Edge, NodeSize, Point } from "../model/graph";

export const HOME_WIDTH = 2600;
export const HOME_HEIGHT = 1700;
const NODE_WIDTH = 222;
const NODE_HEIGHT = 34;
let titleMeasurer: CanvasRenderingContext2D | null | undefined;

export const nodeSize = (note: Pick<NoteSummary, "title" | "displayTitle">): NodeSize => {
	if (titleMeasurer === undefined && typeof document !== "undefined") {
		titleMeasurer = document.createElement("canvas").getContext("2d");
	}
	if (titleMeasurer) titleMeasurer.font = '650 11px Inter, "Segoe UI", "Helvetica Neue", sans-serif';
	const title = displayNoteTitle(note);
	const width = titleMeasurer?.measureText(title).width ?? title.length * 6;
	return { width: Math.min(NODE_WIDTH, Math.max(42, Math.ceil(width + 24))), height: NODE_HEIGHT };
};

export const defaultPosition = (index: number, total: number, size: NodeSize): Point => {
	const angle = index * 2.399963229728653;
	const radius = total < 2 ? 0 : 125 + 85 * Math.sqrt(index);
	return {
		x: HOME_WIDTH / 2 - size.width / 2 + Math.cos(angle) * radius,
		y: HOME_HEIGHT / 2 - size.height / 2 + Math.sin(angle) * radius,
	};
};

export const graphEdges = (notes: NoteSummary[]): Edge[] => {
	const byTitle = createNoteTitleIndex(notes);
	const byId = new Map(notes.map((note) => [normalizeNoteTitle(note.id), note]));
	const unique = new Map<string, Edge>();

	for (const source of notes) {
		for (const targetText of source.links) {
			const target = resolveNoteReference(targetText, byId, byTitle);
			if (!target || target.id === source.id) continue;
			const [firstId, secondId] = [source.id, target.id].sort();
			unique.set(`${firstId}:${secondId}`, { source, target });
		}
	}
	return [...unique.values()];
};

export const graphEdgePath = (edge: Edge, positions: Record<string, Point>, total: number): string => {
	const sourceSize = nodeSize(edge.source);
	const targetSize = nodeSize(edge.target);
	const source = positions[edge.source.id] ?? defaultPosition(0, total, sourceSize);
	const target = positions[edge.target.id] ?? defaultPosition(0, total, targetSize);
	const startX = source.x + sourceSize.width / 2;
	const startY = source.y + sourceSize.height / 2;
	const endX = target.x + targetSize.width / 2;
	const endY = target.y + targetSize.height / 2;
	const curve = Math.max(55, Math.abs(endX - startX) * 0.35);
	const direction = endX >= startX ? 1 : -1;
	return `M ${startX} ${startY} C ${startX + curve * direction} ${startY}, ${endX - curve * direction} ${endY}, ${endX} ${endY}`;
};
