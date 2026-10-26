import type { GraphState } from "../model/graph";

type GraphLayout = "static" | "dynamic";

const storageKey = (vaultId: string, layout: GraphLayout): string =>
	`omega-notes.graph.${encodeURIComponent(vaultId)}.${layout}`;

export const readGraphState = (vaultId: string, layout: GraphLayout = "static"): GraphState => {
	if (!vaultId || typeof window === "undefined") return { positions: {} };
	try {
		const value = localStorage.getItem(storageKey(vaultId, layout));
		if (!value) return { positions: {} };
		const parsed = JSON.parse(value) as GraphState;
		if (!parsed || typeof parsed.positions !== "object" || parsed.positions === null || Array.isArray(parsed.positions)) return { positions: {} };

		const minimumScale = layout === "static" ? 0.55 : 0.15;
		const maximumScale = layout === "static" ? 1.5 : 2.5;
		const zipTies = layout === "static" && Array.isArray(parsed.zipTies)
			? parsed.zipTies.slice(0, 500).flatMap((tie) => {
				if (!tie || typeof tie.id !== "string" || !tie.id || tie.id.length > 100 || !Array.isArray(tie.members)) return [];
				const members = tie.members.slice(0, 500).filter((member) => member && typeof member.edgeKey === "string" && member.edgeKey.length <= 512 && Number.isFinite(member.t) && member.t >= 0 && member.t <= 1);
				const uniqueMembers = [...new Map(members.map((member) => [member.edgeKey, { edgeKey: member.edgeKey, t: member.t }])).values()];
				return uniqueMembers.length >= 2 ? [{ id: tie.id, members: uniqueMembers }] : [];
			})
			: undefined;
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
			...(zipTies?.length ? { zipTies } : {}),
		};
	} catch {
		return { positions: {} };
	}
};

export const saveGraphState = (vaultId: string, state: GraphState, layout: GraphLayout = "static"): void => {
	if (!vaultId || typeof window === "undefined") return;
	try {
		localStorage.setItem(storageKey(vaultId, layout), JSON.stringify(state));
	} catch {
		console.error("The graph remains usable if browser storage is unavailable.");
	}
};
