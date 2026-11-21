import type { NodeSize, Point } from "../model/graph";

export type StaticNode = NodeSize & { id: string };
type Bounds = Point & NodeSize;
const GAP = 12;
const CELL_SIZE = 256;

const pushAlongAxis = (
	positions: Record<string, Point>, nodes: StaticNode[], dragged: ReadonlySet<string>, locked: ReadonlySet<string>,
	axis: keyof Point, delta: number,
): Record<string, Point> => {
	if (!delta) return positions;
	const direction = Math.sign(delta);
	const distance = Math.abs(delta);
	const ordered = nodes.flatMap((node) => {
		const point = positions[node.id];
		if (!point) return [];
		const [length, across, breadth] = axis === "x" ? [node.width, point.y, node.height] : [node.height, point.x, node.width];
		const start = direction > 0 ? point[axis] : -point[axis] - length;
		return [{
			id: node.id, start, end: start + length, across, acrossEnd: across + breadth,
			dragged: dragged.has(node.id) && !locked.has(node.id), locked: locked.has(node.id),
		}];
	}).sort((a, b) => a.start - b.start);

	const pushes = ordered.map((node) => node.dragged ? distance : 0);
	const contacts: { index: number; gap: number }[][] = [];
	let blocked = false;
	// Each contact points forward. Visit in that order so competing pushes use the largest displacement.
	for (let index = 0; index < ordered.length; index++) {
		const node = ordered[index];
		const push = pushes[index];
		if (push <= 0 || node.locked) continue;
		const next: { index: number; gap: number }[] = [];
		contacts[index] = next;
		for (let otherIndex = index + 1; otherIndex < ordered.length; otherIndex++) {
			const other = ordered[otherIndex];
			const gap = Math.max(0, other.start - node.end - GAP);
			if (gap >= push) break;
			if (node.acrossEnd + GAP - other.across <= 1e-8 || other.acrossEnd + GAP - node.across <= 1e-8) continue;
			next.push({ index: otherIndex, gap });
			if (other.locked) blocked = true;
			else pushes[otherIndex] = Math.max(pushes[otherIndex], push - gap);
		}
	}

	if (blocked) {
		// Work back from anchors to find one safe displacement for the whole selection.
		const limits = ordered.map((node) => node.locked ? 0 : distance);
		let allowed = distance;
		for (let index = ordered.length - 1; index >= 0; index--) {
			for (const contact of contacts[index] ?? []) limits[index] = Math.min(limits[index], contact.gap + limits[contact.index]);
			if (ordered[index].dragged) allowed = Math.min(allowed, limits[index]);
		}
		for (let index = 0; index < ordered.length; index++) pushes[index] = ordered[index].dragged ? allowed : 0;
		for (let index = 0; index < ordered.length; index++) {
			for (const contact of contacts[index] ?? []) {
				if (!ordered[contact.index].locked) pushes[contact.index] = Math.max(pushes[contact.index], pushes[index] - contact.gap);
			}
		}
	}

	let result = positions;
	for (let index = 0; index < ordered.length; index++) {
		if (!pushes[index]) continue;
		const id = ordered[index].id;
		const point = positions[id];
		if (result === positions) result = { ...positions };
		result[id] = { ...point, [axis]: point[axis] + direction * pushes[index] };
	}
	return result;
};

/** Sweep each axis through the available space without moving any note backwards to resolve contact. */
export const pushStaticNodes = (
	positions: Record<string, Point>, nodes: StaticNode[], dragged: ReadonlySet<string>, locked: ReadonlySet<string>, delta: Point,
): Record<string, Point> => {
	const first = Math.abs(delta.x) >= Math.abs(delta.y) ? "x" : "y";
	const second = first === "x" ? "y" : "x";
	const next = pushAlongAxis(positions, nodes, dragged, locked, first, delta[first]);
	return pushAlongAxis(next, nodes, dragged, locked, second, delta[second]);
};

/** Mantenha notas bloqueadas como âncoras; priorize as arrastadas ou novas e mova as demais só em colisões. */
export const separateStaticNodes = (
	positions: Record<string, Point>, nodes: StaticNode[], priority: ReadonlySet<string> = new Set(), locked: ReadonlySet<string> = new Set(),
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
	const ordered = [
		...nodes.filter((node) => locked.has(node.id)),
		...nodes.filter((node) => !locked.has(node.id) && priority.has(node.id)),
		...nodes.filter((node) => !locked.has(node.id) && !priority.has(node.id)),
	];
	for (const node of ordered) {
		const origin = positions[node.id];
		if (!origin) continue;
		const fixed = locked.has(node.id);
		let point = origin;
		const candidates: (Point & { cost: number })[] = fixed ? [] : [{ ...origin, cost: 0 }];
		const visited = new Set<string>();
		let placed = fixed;
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
