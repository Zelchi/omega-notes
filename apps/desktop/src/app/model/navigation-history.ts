export type NavigationLocation = { route: "canvas" } | { route: "note"; noteId: string };
export type NavigationHistory = { entries: NavigationLocation[]; index: number };
export type NavigationTransition = (from: NavigationLocation, to: NavigationLocation, commit: () => void) => Promise<void>;

export const createNavigationHistory = (): NavigationHistory => ({ entries: [{ route: "canvas" }], index: 0 });

export const recordNavigation = (history: NavigationHistory, location: NavigationLocation): NavigationHistory => {
	const current = history.entries[history.index];
	if (current.route === location.route && (current.route === "canvas" || location.route === "note" && current.noteId === location.noteId)) return history;
	const entries = [...history.entries.slice(0, history.index + 1), location].slice(-200);
	return { entries, index: entries.length - 1 };
};

export const findHistoryIndex = (history: NavigationHistory, direction: -1 | 1, noteIds: ReadonlySet<string>): number => {
	for (let index = history.index + direction; index >= 0 && index < history.entries.length; index += direction) {
		const location = history.entries[index];
		if (location.route === "canvas" || noteIds.has(location.noteId)) return index;
	}
	return -1;
};
