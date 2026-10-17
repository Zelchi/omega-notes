import type { CanvasLayout } from "@/features/change-preferences";
import type { GraphState } from "../model/graph";

const storageKey = (vaultId: string, layout: CanvasLayout): string =>
	`omega-notes.graph.${encodeURIComponent(vaultId)}.${layout}`;

export const readGraphState = (vaultId: string, layout: CanvasLayout = "static"): GraphState => {
	if (!vaultId || typeof window === "undefined") return { positions: {} };
	try {
		const value = localStorage.getItem(storageKey(vaultId, layout));
		if (!value) return { positions: {} };
		const parsed = JSON.parse(value) as GraphState;
		if (!parsed || typeof parsed.positions !== "object" || parsed.positions === null || Array.isArray(parsed.positions)) return { positions: {} };

		const minimumScale = layout === "static" ? 0.55 : 0.15;
		const maximumScale = layout === "static" ? 1.5 : 2.5;
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
				Number.isFinite(parsed.view.scale) &&
				parsed.view.scale >= minimumScale && parsed.view.scale <= maximumScale
					? parsed.view
					: undefined,
		};
	} catch {
		return { positions: {} };
	}
};

export const saveGraphState = (vaultId: string, state: GraphState, layout: CanvasLayout = "static"): void => {
	if (!vaultId || typeof window === "undefined") return;
	try {
		localStorage.setItem(storageKey(vaultId, layout), JSON.stringify(state));
	} catch {
		console.error("The graph remains usable if browser storage is unavailable.");
	}
};
