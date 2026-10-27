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
type EdgePorts = { start: EdgePoint; end: EdgePoint };
type PortReference = { toward: Point; orderBy: Point };
type EdgePortReferences = Partial<Record<keyof EdgePorts, PortReference>>;
export type RoutedEdgeSegment = EdgeCurve & { startT: number; endT: number };
type RouteAnchor = { t: number; point: Point; tangent: Point; speed: number };

const noteBoundary = (size: NodeSize, position: Point, toward: Point): EdgePoint => {
	const center = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
	const dx = toward.x - center.x;
	const dy = toward.y - center.y;
	if (dx === 0 && dy === 0)
		return { point: { x: center.x + size.width / 2, y: center.y }, tangent: { x: 1, y: 0 }, speed: 0 };
	if (Math.abs(dx) >= Math.abs(dy)) {
		const side = Math.sign(dx);
		const y = Math.max(position.y, Math.min(position.y + size.height, center.y + dy * size.width / (2 * Math.abs(dx))));
		return { point: { x: center.x + side * size.width / 2, y }, tangent: { x: side, y: 0 }, speed: 0 };
	}
	const side = Math.sign(dy);
	const x = Math.max(position.x, Math.min(position.x + size.width, center.x + dx * size.height / (2 * Math.abs(dy))));
	return { point: { x, y: center.y + side * size.height / 2 }, tangent: { x: 0, y: side }, speed: 0 };
};

const edgeBoundaryPorts = (
	edges: Edge[],
	positions: Record<string, Point>,
	total: number,
	references: ReadonlyMap<string, EdgePortReferences> = new Map(),
): Map<string, EdgePorts> => {
	type Side = "left" | "right" | "top" | "bottom";
	type Port = { edgeKey: string; endpoint: keyof EdgePorts; side: Side; position: Point; size: NodeSize; orderBy: Point };
	const ports = new Map<string, EdgePorts>();
	const groups = new Map<string, Port[]>();
	const add = (edgeKey: string, endpoint: keyof EdgePorts, note: NoteSummary, position: Point, size: NodeSize, port: EdgePoint, orderBy: Point): void => {
		const side: Side = Math.abs(port.tangent.x) >= Math.abs(port.tangent.y)
			? port.tangent.x < 0 ? "left" : "right"
			: port.tangent.y < 0 ? "top" : "bottom";
		const key = JSON.stringify([note.id, side]);
		const members = groups.get(key) ?? [];
		members.push({ edgeKey, endpoint, side, position, size, orderBy });
		groups.set(key, members);
	};
	for (const edge of edges) {
		const edgeKey = graphEdgeKey(edge);
		const sourceSize = nodeSize(edge.source), targetSize = nodeSize(edge.target);
		const source = positions[edge.source.id] ?? defaultPosition(0, total, sourceSize);
		const target = positions[edge.target.id] ?? defaultPosition(0, total, targetSize);
		const sourceCenter = { x: source.x + sourceSize.width / 2, y: source.y + sourceSize.height / 2 };
		const targetCenter = { x: target.x + targetSize.width / 2, y: target.y + targetSize.height / 2 };
		const edgeReferences = references.get(edgeKey);
		const startReference = edgeReferences?.start ?? { toward: targetCenter, orderBy: targetCenter };
		const endReference = edgeReferences?.end ?? { toward: sourceCenter, orderBy: sourceCenter };
		const start = noteBoundary(sourceSize, source, startReference.toward), end = noteBoundary(targetSize, target, endReference.toward);
		ports.set(edgeKey, { start, end });
		add(edgeKey, "start", edge.source, source, sourceSize, start, startReference.orderBy);
		add(edgeKey, "end", edge.target, target, targetSize, end, endReference.orderBy);
	}
	for (const members of groups.values()) {
		const side = members[0].side;
		const vertical = side === "left" || side === "right";
		members.sort((left, right) => (vertical ? left.orderBy.y - right.orderBy.y : left.orderBy.x - right.orderBy.x) || left.edgeKey.localeCompare(right.edgeKey));
		const length = vertical ? members[0].size.height : members[0].size.width;
		const spacing = Math.min(6, length / (members.length + 1));
		const margin = (length - spacing * (members.length - 1)) / 2;
		members.forEach(({ edgeKey, endpoint, position, size }, index) => {
			const offset = margin + spacing * index;
			const point = side === "left" ? { x: position.x, y: position.y + offset }
				: side === "right" ? { x: position.x + size.width, y: position.y + offset }
				: side === "top" ? { x: position.x + offset, y: position.y }
				: { x: position.x + offset, y: position.y + size.height };
			const tangent = side === "left" ? { x: -1, y: 0 }
				: side === "right" ? { x: 1, y: 0 }
				: side === "top" ? { x: 0, y: -1 }
				: { x: 0, y: 1 };
			const edgePorts = ports.get(edgeKey)!;
			edgePorts[endpoint] = { point, tangent, speed: edgePorts[endpoint].speed };
		});
	}
	return ports;
};

const safeHandle = (start: Point, end: Point, tangent: Point, requested: number): number => {
	const dx = end.x - start.x, dy = end.y - start.y;
	const distance = Math.hypot(dx, dy);
	if (!distance || tangent.x * dx + tangent.y * dy <= 0) return 0;
	return Math.min(requested, distance * 0.45);
};

const edgeCurve = (edge: Edge, positions: Record<string, Point>, total: number, ports?: EdgePorts): EdgeCurve => {
	const sourceSize = nodeSize(edge.source);
	const targetSize = nodeSize(edge.target);
	const source = positions[edge.source.id] ?? defaultPosition(0, total, sourceSize);
	const target = positions[edge.target.id] ?? defaultPosition(0, total, targetSize);
	const sourceCenter = { x: source.x + sourceSize.width / 2, y: source.y + sourceSize.height / 2 };
	const targetCenter = { x: target.x + targetSize.width / 2, y: target.y + targetSize.height / 2 };
	const start = ports?.start ?? noteBoundary(sourceSize, source, targetCenter);
	const end = ports?.end ?? noteBoundary(targetSize, target, sourceCenter);
	const distance = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
	const startHandle = safeHandle(start.point, end.point, start.tangent, distance * 0.35);
	const endTangent = { x: -end.tangent.x, y: -end.tangent.y };
	const endHandle = safeHandle(start.point, end.point, endTangent, distance * 0.35);
	return {
		start: start.point,
		control1: { x: start.point.x + start.tangent.x * startHandle, y: start.point.y + start.tangent.y * startHandle },
		control2: { x: end.point.x + end.tangent.x * endHandle, y: end.point.y + end.tangent.y * endHandle },
		end: end.point,
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
		const startHandle = safeHandle(start.point, end.point, start.tangent, start.speed * span / 3);
		const endHandle = safeHandle(start.point, end.point, end.tangent, end.speed * span / 3);
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
// Keep wires bound until they diverge by almost a full note width.
const ZIP_TIE_DETACH_DISTANCE = 192;

type ZipTieGeometry = {
	placement: ZipTiePlacement;
	slots: Map<string, Point>;
	samples: Map<string, EdgePoint>;
	tangents: Map<string, Point>;
};

const zipTieGeometry = (
	tie: ZipTie,
	edgesByKey: ReadonlyMap<string, Edge>,
	positions: Record<string, Point>,
	total: number,
	routeFor: (edgeKey: string) => readonly RoutedEdgeSegment[] | undefined = () => undefined,
	curveFor: (edge: Edge) => EdgeCurve = (edge) => edgeCurve(edge, positions, total),
): ZipTieGeometry | undefined => {
	if (tie.members.length < 2) return;
	const samples = new Map<string, EdgePoint>();
	for (const { edgeKey, t } of tie.members) {
		const edge = edgesByKey.get(edgeKey);
		if (!edge || !Number.isFinite(t) || t < 0 || t > 1) return;
		samples.set(edgeKey, edgePointOnRoute(curveFor(edge), routeFor(edgeKey), t));
	}
	const points = [...samples.values()];
	const center = points.reduce((sum, sample) => ({ x: sum.x + sample.point.x / points.length, y: sum.y + sample.point.y / points.length }), { x: 0, y: 0 });
	const reference = samples.get([...samples.keys()].sort()[0]!)!.tangent;
	const aligned = [...samples].map(([edgeKey, { tangent }]) => {
		const dot = tangent.x * reference.x + tangent.y * reference.y;
		// A near-perpendicular fan is not evidence that a wire runs backward.
		const sign = dot < -0.1 ? -1 : 1;
		return { edgeKey, sign, tangent: { x: tangent.x * sign, y: tangent.y * sign } };
	});
	const direction = aligned.reduce((sum, { tangent }) => ({ x: sum.x + tangent.x, y: sum.y + tangent.y }), { x: 0, y: 0 });
	const directionLength = Math.hypot(direction.x, direction.y) || 1;
	let normalizedDirection = { x: direction.x / directionLength, y: direction.y / directionLength };
	const reverseDirection = normalizedDirection.x < -1e-6 || (Math.abs(normalizedDirection.x) <= 1e-6 && normalizedDirection.y > 0);
	if (reverseDirection)
		normalizedDirection = { x: -normalizedDirection.x, y: -normalizedDirection.y };
	const tangents = new Map(aligned.map(({ edgeKey, sign }) => {
		const directionSign = sign * (reverseDirection ? -1 : 1);
		return [edgeKey, { x: normalizedDirection.x * directionSign, y: normalizedDirection.y * directionSign }] as const;
	}));
	const normal = { x: -normalizedDirection.y, y: normalizedDirection.x };
	const projection = (point: Point): number => point.x * normal.x + point.y * normal.y;
	const neighboringNoteProjection = (edgeKey: string): number => {
		const edge = edgesByKey.get(edgeKey)!;
		const sample = samples.get(edgeKey)!.point;
		const center = (note: NoteSummary): Point => {
			const position = positions[note.id] ?? defaultPosition(0, total, nodeSize(note));
			const size = nodeSize(note);
			return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
		};
		const source = center(edge.source), target = center(edge.target);
		return projection(Math.hypot(sample.x - source.x, sample.y - source.y) <= Math.hypot(sample.x - target.x, sample.y - target.y) ? source : target);
	};
	const orderedKeys = [...samples.keys()].sort((leftKey, rightKey) => {
		const difference = projection(samples.get(rightKey)!.point) - projection(samples.get(leftKey)!.point);
		if (Math.abs(difference) > 1e-4) return difference;
		const noteDifference = neighboringNoteProjection(rightKey) - neighboringNoteProjection(leftKey);
		return Math.abs(noteDifference) > 1e-4 ? noteDifference : leftKey.localeCompare(rightKey);
	});
	const slots = new Map(orderedKeys.map((edgeKey, index) => {
		const offset = ((orderedKeys.length - 1) / 2 - index) * ZIP_TIE_WIRE_SPACING;
		return [edgeKey, { x: center.x + normal.x * offset, y: center.y + normal.y * offset }];
	}));
	const width = Math.max(18, (orderedKeys.length - 1) * ZIP_TIE_WIRE_SPACING + ZIP_TIE_MARGIN);
	return {
		placement: { ...center, angle: Math.atan2(normalizedDirection.y, normalizedDirection.x) * 180 / Math.PI + 90, width },
		slots,
		samples,
		tangents,
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
	type TieReference = { t: number; center: Point; slot: Point };
	const buildRoutes = (boundaryPorts: Map<string, EdgePorts>) => {
		const curveFor = (edge: Edge): EdgeCurve => edgeCurve(edge, positions, total, boundaryPorts.get(graphEdgeKey(edge)));
		const anchorsByKey = new Map<string, RouteAnchor[]>();
		const routesByKey = new Map<string, RoutedEdgeSegment[]>();
		const tieReferencesByEdge = new Map<string, TieReference[]>();
		const routeFor = (edgeKey: string): readonly RoutedEdgeSegment[] | undefined => {
			const edge = edgesByKey.get(edgeKey);
			if (!edge) return;
			let route = routesByKey.get(edgeKey);
			if (!route) {
				route = routeCurve(curveFor(edge), anchorsByKey.get(edgeKey) ?? []);
				routesByKey.set(edgeKey, route);
			}
			return route;
		};
		const zipTies: { tie: ZipTie; placement: ZipTiePlacement }[] = [];
		for (const tie of ties) {
			const geometry = zipTieGeometry(tie, edgesByKey, positions, total, routeFor, curveFor);
			if (!geometry) continue;
			zipTies.push({ tie, placement: geometry.placement });
			for (const { edgeKey, t } of tie.members) {
				const slot = geometry.slots.get(edgeKey);
				const sample = geometry.samples.get(edgeKey);
				const tangent = geometry.tangents.get(edgeKey);
				if (!slot || !sample || !tangent) continue;
				const anchors = anchorsByKey.get(edgeKey) ?? [];
				anchors.push({ t, point: slot, tangent, speed: sample.speed });
				anchorsByKey.set(edgeKey, anchors);
				routesByKey.delete(edgeKey);
				const references = tieReferencesByEdge.get(edgeKey) ?? [];
				references.push({ t, center: geometry.placement, slot });
				tieReferencesByEdge.set(edgeKey, references);
			}
		}
		for (const edge of edges) routeFor(graphEdgeKey(edge));
		return { routesByKey, zipTies, tieReferencesByEdge };
	};
	const initial = buildRoutes(edgeBoundaryPorts(edges, positions, total));
	if (!ties.length) return { routesByKey: initial.routesByKey, zipTies: initial.zipTies };
	const references = new Map<string, EdgePortReferences>();
	for (const [edgeKey, entries] of initial.tieReferencesByEdge) {
		const nearestToStart = entries.reduce((nearest, entry) => entry.t < nearest.t ? entry : nearest);
		const nearestToEnd = entries.reduce((nearest, entry) => entry.t > nearest.t ? entry : nearest);
		references.set(edgeKey, {
			start: { toward: nearestToStart.center, orderBy: nearestToStart.slot },
			end: { toward: nearestToEnd.center, orderBy: nearestToEnd.slot },
		});
	}
	const final = buildRoutes(edgeBoundaryPorts(edges, positions, total, references));
	return { routesByKey: final.routesByKey, zipTies: final.zipTies };
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
