import type { CanvasLayout } from "@/features/change-preferences";
import type { GraphState } from "../model/graph";

const STORAGE_KEY = "omega-notes.graph.v1";

export const readGraphState = (layout: CanvasLayout = "static"): GraphState => {
	if (typeof window === "undefined") return { positions: {} };
	try {
		const value = localStorage.getItem(layout === "static" ? STORAGE_KEY : "omega-notes.graph.dynamic.v1");
		if (!value) return { positions: {} };
		const parsed = JSON.parse(value) as GraphState;
		if (!parsed || typeof parsed.positions !== "object" || parsed.positions === null) return { positions: {} };

		return {
			positions: Object.fromEntries(
				Object.entries(parsed.positions).filter(
					([, point]) => Number.isFinite(point?.x) && Number.isFinite(point?.y),
				),
			),
			view:
				parsed.view &&
				Number.isFinite(parsed.view.x) &&
				Number.isFinite(parsed.view.y) &&
				Number.isFinite(parsed.view.scale)
					? parsed.view
					: undefined,
		};
	} catch {
		return { positions: {} };
	}
};

export const saveGraphState = (state: GraphState, layout: CanvasLayout = "static"): void => {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(layout === "static" ? STORAGE_KEY : "omega-notes.graph.dynamic.v1", JSON.stringify(state));
	} catch {
		console.error("The graph remains usable if browser storage is unavailable.");
	}
};
