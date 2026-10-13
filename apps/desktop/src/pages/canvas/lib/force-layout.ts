import type { Point } from "../model/graph";

type Body = Point & { id: string; vx: number; vy: number; fixed?: Point };
type Link = { source: string; target: string };
const CELL_SIZE = 240;

/** Local repulsion, link attraction and gravity; no permanent manual placement. */
export class ForceLayout {
	private bodies = new Map<string, Body>();
	private links: Link[] = [];
	private signature = "";
	private alpha = 0;

	constructor(private initialPositions: Record<string, Point>) {}

	setGraph(ids: string[], links: Link[]): boolean {
		const signature = JSON.stringify([ids, links]);
		if (signature === this.signature) return false;
		this.signature = signature;
		const activeIds = new Set(ids);
		for (const id of this.bodies.keys()) if (!activeIds.has(id)) this.bodies.delete(id);
		ids.forEach((id, index) => {
			if (this.bodies.has(id)) return;
			const saved = this.initialPositions[id];
			const radius = 75 * Math.sqrt(index);
			const angle = index * 2.399963229728653;
			this.bodies.set(id, { id, x: saved?.x ?? Math.cos(angle) * radius,
				y: saved?.y ?? Math.sin(angle) * radius, vx: 0, vy: 0 });
		});
		this.initialPositions = {};
		this.links = links.filter((link) => activeIds.has(link.source) && activeIds.has(link.target));
		this.wake();
		return true;
	}

	wake(): void { this.alpha = 1; }
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
		return Object.fromEntries([...this.bodies].map(([id, body]) => [id, { x: body.x, y: body.y }]));
	}

	step(): void {
		if (!this.active) return;
		const grid = new Map<string, Body[]>();
		for (const body of this.bodies.values()) {
			const key = `${Math.floor(body.x / CELL_SIZE)},${Math.floor(body.y / CELL_SIZE)}`;
			const cell = grid.get(key);
			if (cell) cell.push(body);
			else grid.set(key, [body]);
		}
		for (const body of this.bodies.values()) {
			const cellX = Math.floor(body.x / CELL_SIZE);
			const cellY = Math.floor(body.y / CELL_SIZE);
			for (let x = cellX - 1; x <= cellX + 1; x++) {
				for (let y = cellY - 1; y <= cellY + 1; y++) {
					for (const other of grid.get(`${x},${y}`) ?? []) {
						if (body === other) continue;
						let dx = body.x - other.x;
						let dy = body.y - other.y;
						if (Math.abs(dx) + Math.abs(dy) < 0.01) {
							dx = body.id < other.id ? -0.1 : 0.1;
							dy = 0.1;
						}
						const distance = Math.hypot(dx, dy);
						if (distance > CELL_SIZE) continue;
						const force = (Math.min(4, 1600 / (distance * distance + 64)) + Math.max(0, 55 - distance) * 0.08) * this.alpha;
						body.vx += dx / distance * force;
						body.vy += dy / distance * force;
					}
				}
			}
		}
		for (const link of this.links) {
			const source = this.bodies.get(link.source)!;
			const target = this.bodies.get(link.target)!;
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
