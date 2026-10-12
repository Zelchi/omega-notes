import type { NodeSize, Point } from "../model/graph";

export type StaticNode = NodeSize & { id: string };
type Bounds = Point & NodeSize;
const GAP = 12;
const CELL_SIZE = 256;

/** Keep the dragged/new notes first; only move other notes when their bounds collide. */
export const separateStaticNodes = (
	positions: Record<string, Point>, nodes: StaticNode[], priority: ReadonlySet<string> = new Set(),
): Record<string, Point> => {
	const cells = new Map<string, Bounds[]>();
	let minimumY = Infinity;
	let result = positions;
	const keys = (bounds: Bounds): string[] => {
		const result: string[] = [];
		for (let x = Math.floor((bounds.x - GAP) / CELL_SIZE); x <= Math.floor((bounds.x + bounds.width + GAP) / CELL_SIZE); x++) {
			for (let y = Math.floor((bounds.y - GAP) / CELL_SIZE); y <= Math.floor((bounds.y + bounds.height + GAP) / CELL_SIZE); y++) result.push(`${x},${y}`);
		}
		return result;
	};
	const collision = (bounds: Bounds): Bounds | undefined => {
		const visited = new Set<Bounds>();
		for (const key of keys(bounds)) for (const other of cells.get(key) ?? []) {
			if (visited.has(other)) continue;
			visited.add(other);
			if (bounds.x < other.x + other.width + GAP && bounds.x + bounds.width + GAP > other.x &&
				bounds.y < other.y + other.height + GAP && bounds.y + bounds.height + GAP > other.y) return other;
		}
	};
	const ordered = [...nodes.filter((node) => priority.has(node.id)), ...nodes.filter((node) => !priority.has(node.id))];
	for (const node of ordered) {
		const origin = positions[node.id];
		if (!origin) continue;
		let point = origin;
		const candidates: (Point & { cost: number })[] = [{ ...origin, cost: 0 }];
		const visited = new Set<string>();
		let placed = false;
		// Search nearby empty positions first; a free strip above the layout is a bounded fallback.
		for (let attempt = 0; candidates.length && attempt < 256; attempt++) {
			candidates.sort((a, b) => b.cost - a.cost);
			const candidate = candidates.pop()!;
			const key = `${candidate.x},${candidate.y}`;
			if (visited.has(key)) continue;
			visited.add(key);
			const other = collision({ ...candidate, width: node.width, height: node.height });
			if (!other) { point = candidate; placed = true; break; }
			for (const next of [
				{ x: other.x - node.width - GAP, y: candidate.y },
				{ x: other.x + other.width + GAP, y: candidate.y },
				{ x: candidate.x, y: other.y - node.height - GAP },
				{ x: candidate.x, y: other.y + other.height + GAP },
			]) {
				if (!visited.has(`${next.x},${next.y}`)) candidates.push({ ...next, cost: (next.x - origin.x) ** 2 + (next.y - origin.y) ** 2 });
			}
		}
		if (!placed) point = { x: origin.x, y: minimumY - node.height - GAP };
		if (point.x !== origin.x || point.y !== origin.y) {
			if (result === positions) result = { ...positions };
			result[node.id] = { x: point.x, y: point.y };
		}
		const bounds = { x: point.x, y: point.y, width: node.width, height: node.height };
		minimumY = Math.min(minimumY, point.y);
		for (const key of keys(bounds)) {
			const cell = cells.get(key);
			if (cell) cell.push(bounds);
			else cells.set(key, [bounds]);
		}
	}
	return result;
};
