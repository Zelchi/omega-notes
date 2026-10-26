import {
	createNoteTitleIndex,
	displayNoteTitle,
	normalizeNoteTitle,
	resolveNoteReference,
	type NoteSummary,
} from "@/entities/note";
import type { Edge, NodeSize, Point, ZipTie } from "../model/graph";

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
			const ordered = source.id === firstId ? { source, target } : { source: target, target: source };
			unique.set(`${firstId}:${secondId}`, ordered);
		}
	}
	return [...unique.values()];
};

export const graphEdgeKey = (edge: Edge): string => JSON.stringify([edge.source.id, edge.target.id].sort());

type EdgeCurve = { start: Point; control1: Point; control2: Point; end: Point };
type EdgePoint = { point: Point; tangent: Point; speed: number };
export type RoutedEdgeSegment = EdgeCurve & { startT: number; endT: number };
type RouteAnchor = { t: number; point: Point; tangent: Point; speed: number };

const edgeCurve = (edge: Edge, positions: Record<string, Point>, total: number): EdgeCurve => {
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
	return {
		start: { x: startX, y: startY },
		control1: { x: startX + curve * direction, y: startY },
		control2: { x: endX - curve * direction, y: endY },
		end: { x: endX, y: endY },
	};
};

const edgePointAt = (curve: EdgeCurve, t: number): EdgePoint => {
	const inverse = 1 - t;
	const point = {
		x: inverse ** 3 * curve.start.x + 3 * inverse ** 2 * t * curve.control1.x + 3 * inverse * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
		y: inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
	};
	const tangent = {
		x: 3 * inverse ** 2 * (curve.control1.x - curve.start.x) + 6 * inverse * t * (curve.control2.x - curve.control1.x) + 3 * t ** 2 * (curve.end.x - curve.control2.x),
		y: 3 * inverse ** 2 * (curve.control1.y - curve.start.y) + 6 * inverse * t * (curve.control2.y - curve.control1.y) + 3 * t ** 2 * (curve.end.y - curve.control2.y),
	};
	const speed = Math.hypot(tangent.x, tangent.y);
	const length = speed || 1;
	return { point, tangent: { x: tangent.x / length, y: tangent.y / length }, speed };
};

const edgePointOnRoute = (curve: EdgeCurve, route: readonly RoutedEdgeSegment[] | undefined, t: number): EdgePoint => {
	if (!route?.length) return edgePointAt(curve, t);
	const segment = route.find((item) => t >= item.startT && t <= item.endT) ?? route.at(-1)!;
	const span = segment.endT - segment.startT;
	const point = edgePointAt(segment, span > 0 ? (t - segment.startT) / span : 0);
	return { ...point, speed: point.speed / (span || 1) };
};

const routeCurve = (curve: EdgeCurve, anchors: readonly RouteAnchor[]): RoutedEdgeSegment[] => {
	const knots: RouteAnchor[] = [
		{ t: 0, ...edgePointAt(curve, 0) },
		...anchors.filter((anchor) => anchor.t > 0 && anchor.t < 1).sort((left, right) => left.t - right.t),
		{ t: 1, ...edgePointAt(curve, 1) },
	];
	const unique = knots.filter((knot, index) => index === 0 || knot.t - knots[index - 1].t > 1e-5);
	return unique.slice(1).map((end, index) => {
		const start = unique[index];
		const span = end.t - start.t;
		const distance = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
		const startHandle = Math.min(start.speed * span / 3, distance * 0.55);
		const endHandle = Math.min(end.speed * span / 3, distance * 0.55);
		return {
			startT: start.t,
			endT: end.t,
			start: start.point,
			control1: { x: start.point.x + start.tangent.x * startHandle, y: start.point.y + start.tangent.y * startHandle },
			control2: { x: end.point.x - end.tangent.x * endHandle, y: end.point.y - end.tangent.y * endHandle },
			end: end.point,
		};
	});
};

export const graphEdgePointAt = (
	edge: Edge,
	positions: Record<string, Point>,
	total: number,
	t: number,
	route?: readonly RoutedEdgeSegment[],
): Point => edgePointOnRoute(edgeCurve(edge, positions, total), route, Math.max(0, Math.min(1, t))).point;

export const nearestGraphEdgePoint = (
	edge: Edge,
	positions: Record<string, Point>,
	total: number,
	point: Point,
	route?: readonly RoutedEdgeSegment[],
): EdgePoint & { t: number; distance: number } => {
	const curve = edgeCurve(edge, positions, total);
	let bestT = 0;
	let bestDistance = Infinity;
	for (let index = 0; index <= 48; index++) {
		const t = index / 48;
		const candidate = edgePointOnRoute(curve, route, t);
		const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
		if (distance < bestDistance) { bestDistance = distance; bestT = t; }
	}
	let radius = 1 / 48;
	for (let iteration = 0; iteration < 5; iteration++) {
		const start = Math.max(0, bestT - radius), end = Math.min(1, bestT + radius);
		for (let step = 0; step <= 8; step++) {
			const t = start + (end - start) * step / 8;
			const candidate = edgePointOnRoute(curve, route, t);
			const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
			if (distance < bestDistance) { bestDistance = distance; bestT = t; }
		}
		radius = (end - start) / 8;
	}
	const nearest = edgePointOnRoute(curve, route, bestT);
	return { ...nearest, t: bestT, distance: bestDistance };
};

export const graphEdgesCrossedByStroke = (
	edges: Edge[],
	positions: Record<string, Point>,
	total: number,
	start: Point,
	end: Point,
	tolerance: number,
	routes?: ReadonlyMap<string, readonly RoutedEdgeSegment[]>,
): { edgeKey: string; t: number }[] => {
	const stroke = { x: end.x - start.x, y: end.y - start.y };
	const strokeLength = Math.hypot(stroke.x, stroke.y);
	if (strokeLength < 1) return [];
	const distanceToStroke = (point: Point): number => {
		const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * stroke.x + (point.y - start.y) * stroke.y) / (strokeLength ** 2)));
		return Math.hypot(point.x - start.x - ratio * stroke.x, point.y - start.y - ratio * stroke.y);
	};
	return edges.flatMap((edge) => {
		const curve = edgeCurve(edge, positions, total);
		const route = routes?.get(graphEdgeKey(edge));
		let bestT = 0;
		let bestDistance = Infinity;
		const inspect = (t: number): void => {
			const distance = distanceToStroke(edgePointOnRoute(curve, route, t).point);
			if (distance < bestDistance) { bestDistance = distance; bestT = t; }
		};
		const samples = 64;
		for (let index = 0; index <= samples; index++) inspect(index / samples);
		let radius = 1 / samples;
		for (let iteration = 0; iteration < 5; iteration++) {
			const low = Math.max(0, bestT - radius), high = Math.min(1, bestT + radius);
			for (let step = 0; step <= 8; step++) inspect(low + (high - low) * step / 8);
			radius = (high - low) / 8;
		}
		const nearest = edgePointOnRoute(curve, route, bestT);
		const alongStroke = Math.abs((nearest.tangent.x * stroke.x + nearest.tangent.y * stroke.y) / strokeLength);
		return bestDistance <= tolerance && alongStroke < 0.82 ? [{ edgeKey: graphEdgeKey(edge), t: bestT }] : [];
	});
};

export type ZipTiePlacement = Point & { angle: number; width: number };
const ZIP_TIE_WIRE_SPACING = 6;
const ZIP_TIE_MARGIN = 12;
// shortcut: 36-unit increase in bundle offset, use path-distance clustering if non-drag layout changes must detach wires.
const ZIP_TIE_DETACH_DISTANCE = ZIP_TIE_WIRE_SPACING * 6;

type ZipTieGeometry = {
	placement: ZipTiePlacement;
	direction: Point;
	slots: Map<string, Point>;
	samples: Map<string, EdgePoint>;
};

const zipTieGeometry = (
	tie: ZipTie,
	edgesByKey: ReadonlyMap<string, Edge>,
	positions: Record<string, Point>,
	total: number,
	routeFor: (edgeKey: string) => readonly RoutedEdgeSegment[] | undefined = () => undefined,
): ZipTieGeometry | undefined => {
	if (tie.members.length < 2) return;
	const samples = new Map<string, EdgePoint>();
	for (const { edgeKey, t } of tie.members) {
		const edge = edgesByKey.get(edgeKey);
		if (!edge || !Number.isFinite(t) || t < 0 || t > 1) return;
		samples.set(edgeKey, edgePointOnRoute(edgeCurve(edge, positions, total), routeFor(edgeKey), t));
	}
	const points = [...samples.values()];
	const center = points.reduce((sum, sample) => ({ x: sum.x + sample.point.x / points.length, y: sum.y + sample.point.y / points.length }), { x: 0, y: 0 });
	const reference = samples.get([...samples.keys()].sort()[0]!)!.tangent;
	const aligned = points.map(({ tangent }) => {
		const dot = tangent.x * reference.x + tangent.y * reference.y;
		return dot < 0 ? { x: -tangent.x, y: -tangent.y } : tangent;
	});
	const direction = aligned.reduce((sum, tangent) => ({ x: sum.x + tangent.x, y: sum.y + tangent.y }), { x: 0, y: 0 });
	const directionLength = Math.hypot(direction.x, direction.y) || 1;
	const normalizedDirection = { x: direction.x / directionLength, y: direction.y / directionLength };
	const normal = { x: -normalizedDirection.y, y: normalizedDirection.x };
	const orderedKeys = [...samples.keys()].sort();
	const slots = new Map(orderedKeys.map((edgeKey, index) => {
		const offset = (index - (orderedKeys.length - 1) / 2) * ZIP_TIE_WIRE_SPACING;
		return [edgeKey, { x: center.x + normal.x * offset, y: center.y + normal.y * offset }];
	}));
	const width = Math.max(18, (orderedKeys.length - 1) * ZIP_TIE_WIRE_SPACING + ZIP_TIE_MARGIN);
	return {
		placement: { ...center, angle: Math.atan2(normalizedDirection.y, normalizedDirection.x) * 180 / Math.PI + 90, width },
		direction: normalizedDirection,
		slots,
		samples,
	};
};

export const zipTiePlacement = (
	tie: ZipTie,
	edgesByKey: ReadonlyMap<string, Edge>,
	positions: Record<string, Point>,
	total: number,
	routes?: ReadonlyMap<string, readonly RoutedEdgeSegment[]>,
): ZipTiePlacement | undefined => zipTieGeometry(tie, edgesByKey, positions, total, (edgeKey) => routes?.get(edgeKey))?.placement;

export const zipTieClearOfNotes = (
	placement: ZipTiePlacement,
	notes: NoteSummary[],
	positions: Record<string, Point>,
	clearance = 8,
): boolean => {
	const angle = placement.angle * Math.PI / 180;
	const halfWidth = placement.width / 2;
	const halfHeight = 7;
	const extentX = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfHeight + clearance;
	const extentY = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfHeight + clearance;
	return notes.every((note, index) => {
		const size = nodeSize(note);
		const position = positions[note.id] ?? defaultPosition(index, notes.length, size);
		return placement.x + extentX <= position.x || placement.x - extentX >= position.x + size.width ||
			placement.y + extentY <= position.y || placement.y - extentY >= position.y + size.height;
	});
};

export const routeGraphEdges = (
	edges: Edge[],
	positions: Record<string, Point>,
	total: number,
	ties: ZipTie[],
): { routesByKey: Map<string, RoutedEdgeSegment[]>; zipTies: { tie: ZipTie; placement: ZipTiePlacement }[] } => {
	const edgesByKey = new Map(edges.map((edge) => [graphEdgeKey(edge), edge]));
	const anchorsByKey = new Map<string, RouteAnchor[]>();
	const routesByKey = new Map<string, RoutedEdgeSegment[]>();
	const routeFor = (edgeKey: string): readonly RoutedEdgeSegment[] | undefined => {
		const edge = edgesByKey.get(edgeKey);
		if (!edge) return;
		let route = routesByKey.get(edgeKey);
		if (!route) {
			route = routeCurve(edgeCurve(edge, positions, total), anchorsByKey.get(edgeKey) ?? []);
			routesByKey.set(edgeKey, route);
		}
		return route;
	};
	const renderedZipTies: { tie: ZipTie; placement: ZipTiePlacement }[] = [];
	for (const tie of ties) {
		const geometry = zipTieGeometry(tie, edgesByKey, positions, total, routeFor);
		if (!geometry) continue;
		renderedZipTies.push({ tie, placement: geometry.placement });
		for (const { edgeKey, t } of tie.members) {
			const point = geometry.slots.get(edgeKey);
			const sample = geometry.samples.get(edgeKey);
			if (!point || !sample) continue;
			const anchors = anchorsByKey.get(edgeKey) ?? [];
			anchors.push({ t, point, tangent: geometry.direction, speed: sample.speed });
			anchorsByKey.set(edgeKey, anchors);
			routesByKey.delete(edgeKey);
		}
	}
	for (const edge of edges) routeFor(graphEdgeKey(edge));
	return { routesByKey, zipTies: renderedZipTies };
};

export const zipTiesAfterNodeMove = (
	ties: ZipTie[],
	edgesByKey: ReadonlyMap<string, Edge>,
	before: Record<string, Point>,
	after: Record<string, Point>,
	total: number,
	movedNoteIds: ReadonlySet<string>,
): ZipTie[] => ties.flatMap((tie) => {
	const points = tie.members.flatMap((member) => {
		const edge = edgesByKey.get(member.edgeKey);
		if (!edge) return [];
		return [{
			member,
			before: graphEdgePointAt(edge, before, total, member.t),
			after: graphEdgePointAt(edge, after, total, member.t),
			moved: movedNoteIds.has(edge.source.id) || movedNoteIds.has(edge.target.id),
		}];
	});
	if (!points.some(({ moved }) => moved)) return [tie];
	const offset = (index: number, field: "before" | "after"): number => {
		const point = points[index][field];
		const others = points.filter((_, otherIndex) => otherIndex !== index);
		const center = others.reduce((sum, other) => ({ x: sum.x + other[field].x / others.length, y: sum.y + other[field].y / others.length }), { x: 0, y: 0 });
		return Math.hypot(point.x - center.x, point.y - center.y);
	};
	const members = points.filter(({ moved }, index) => {
		if (!moved || points.length < 2) return true;
		return offset(index, "after") - offset(index, "before") <= ZIP_TIE_DETACH_DISTANCE;
	}).map(({ member }) => member);
	return members.length >= 2 ? [{ ...tie, members }] : [];
});

export const slideZipTie = (
	tie: ZipTie,
	edgesByKey: ReadonlyMap<string, Edge>,
	positions: Record<string, Point>,
	total: number,
	delta: Point,
	routes?: ReadonlyMap<string, readonly RoutedEdgeSegment[]>,
	notes: NoteSummary[] = [],
): ZipTie | undefined => {
	const members = tie.members.flatMap((member) => {
		const edge = edgesByKey.get(member.edgeKey);
		if (!edge) return [];
		const route = routes?.get(member.edgeKey);
		const origin = graphEdgePointAt(edge, positions, total, member.t, route);
		const nearest = nearestGraphEdgePoint(edge, positions, total, { x: origin.x + delta.x, y: origin.y + delta.y }, route);
		return [{ edgeKey: member.edgeKey, t: nearest.t }];
	});
	const next = { ...tie, members };
	const placement = zipTiePlacement(next, edgesByKey, positions, total, routes);
	return members.length === tie.members.length && placement && zipTieClearOfNotes(placement, notes, positions) ? next : undefined;
};

export const graphEdgePath = (
	edge: Edge,
	positions: Record<string, Point>,
	total: number,
	route?: readonly RoutedEdgeSegment[],
): string => {
	const curve = edgeCurve(edge, positions, total);
	const segments = route?.length ? route : [{ ...curve, startT: 0, endT: 1 }];
	return `M ${segments[0].start.x} ${segments[0].start.y}${segments.map((segment) => ` C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`).join("")}`;
};
