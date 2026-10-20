import type { Point } from "../model/graph";

type Body = Point & { id: string; vx: number; vy: number; fixed?: Point };
type Link = { source: string; target: string };
const CELL_SIZE = 240;

/** Local repulsion, link attraction and gravity; no permanent manual placement. */
export class ForceLayout {
	private bodies = new Map<string, Body>();
	private links: { source: Body; target: Body }[] = [];
	private signature = "";
	private alpha = 0;

	private initialPositions: Record<string, Point>;
	constructor(initialPositions: Record<string, Point>) { this.initialPositions = initialPositions; }

	setGraph(ids: string[], links: Link[]): boolean {
		const signature = JSON.stringify([
			[...ids].sort(),
			links.map(({ source, target }) => [source, target].sort()).sort((a, b) =>
				a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
		]);
		if (signature === this.signature) return false;
		this.signature = signature;
		const activeIds = new Set(ids);
		for (const id of this.bodies.keys()) if (!activeIds.has(id)) this.bodies.delete(id);
		ids.forEach((id, index) => {
			if (this.bodies.has(id)) return;
			const saved = this.initialPositions[id];
			const radius = 75 * Math.sqrt(index);
			const angle = index * 2.399963229728653;
			this.bodies.set(id, {
				id, x: saved?.x ?? Math.cos(angle) * radius,
				y: saved?.y ?? Math.sin(angle) * radius, vx: 0, vy: 0
			});
		});
		this.initialPositions = {};
		this.links = links.flatMap((link) => {
			const source = this.bodies.get(link.source);
			const target = this.bodies.get(link.target);
			return source && target ? [{ source, target }] : [];
		});
		this.wake();
		return true;
	}

	restorePositions(positions: Record<string, Point>): void {
		for (const [id, point] of Object.entries(positions)) {
			const body = this.bodies.get(id);
			if (body) Object.assign(body, point, { vx: 0, vy: 0, fixed: undefined });
		}
		this.alpha = 0;
	}

	wake(): void { this.alpha = this.bodies.size ? 1 : 0; }
	get active(): boolean { return this.alpha > 0.015; }

	pin(id: string, point: Point): void {
		const body = this.bodies.get(id);
		if (!body) return;
		Object.assign(body, point, { vx: 0, vy: 0, fixed: point });
		this.wake();
	}

	release(id: string): void {
		const body = this.bodies.get(id);
		if (body) body.fixed = undefined;
		this.wake();
	}

	positions(): Record<string, Point> {
		const positions: Record<string, Point> = {};
		for (const body of this.bodies.values()) positions[body.id] = { x: body.x, y: body.y };
		return positions;
	}

	step(): void {
		if (!this.active) return;
		const bodies = [...this.bodies.values()];
		const grid = new Map<number, Map<number, number[]>>();
		for (let index = 0; index < bodies.length; index++) {
			const body = bodies[index];
			const cellX = Math.floor(body.x / CELL_SIZE), cellY = Math.floor(body.y / CELL_SIZE);
			let column = grid.get(cellX);
			if (!column) { column = new Map(); grid.set(cellX, column); }
			const cell = column.get(cellY);
			if (cell) cell.push(index);
			else column.set(cellY, [index]);
		}
		for (let index = 0; index < bodies.length; index++) {
			const body = bodies[index];
			const cellX = Math.floor(body.x / CELL_SIZE);
			const cellY = Math.floor(body.y / CELL_SIZE);
			for (let x = cellX - 1; x <= cellX + 1; x++) {
				const column = grid.get(x);
				if (!column) continue;
				for (let y = cellY - 1; y <= cellY + 1; y++) {
					const cell = column.get(y);
					if (!cell) continue;
					for (const otherIndex of cell) {
						if (otherIndex <= index) continue;
						const other = bodies[otherIndex];
						let dx = body.x - other.x;
						let dy = body.y - other.y;
						if (Math.abs(dx) + Math.abs(dy) < 0.01) {
							dx = body.id < other.id ? -0.1 : 0.1;
							dy = 0.1;
						}
						const squaredDistance = dx * dx + dy * dy;
						if (squaredDistance > CELL_SIZE * CELL_SIZE) continue;
						const distance = Math.sqrt(squaredDistance);
						const force = (Math.min(4, 1600 / (squaredDistance + 64)) + Math.max(0, 55 - distance) * 0.08) * this.alpha;
						const fx = dx / distance * force;
						const fy = dy / distance * force;
						body.vx += fx; body.vy += fy;
						other.vx -= fx; other.vy -= fy;
					}
				}
			}
		}
		for (const link of this.links) {
			const { source, target } = link;
			const dx = target.x - source.x;
			const dy = target.y - source.y;
			const distance = Math.max(1, Math.hypot(dx, dy));
			const force = (distance - 115) * 0.025 * this.alpha;
			const fx = dx / distance * force;
			const fy = dy / distance * force;
			source.vx += fx; source.vy += fy;
			target.vx -= fx; target.vy -= fy;
		}
		for (const body of this.bodies.values()) {
			if (body.fixed) { Object.assign(body, body.fixed, { vx: 0, vy: 0 }); continue; }
			body.vx = Math.max(-12, Math.min(12, (body.vx - body.x * 0.003 * this.alpha) * 0.82));
			body.vy = Math.max(-12, Math.min(12, (body.vy - body.y * 0.003 * this.alpha) * 0.82));
			body.x += body.vx;
			body.y += body.vy;
		}
		this.alpha *= 0.98;
	}
}
