export type NavigationLocation = { route: "canvas" } | { route: "note"; noteId: string };
type NoteLocation = Extract<NavigationLocation, { route: "note" }>;
export type NavigationHistory = { entries: NoteLocation[]; index: number };

export const createNavigationHistory = (): NavigationHistory => ({ entries: [], index: -1 });

export const recordNavigation = (history: NavigationHistory, location: NoteLocation): NavigationHistory => {
	const current = history.entries[history.index];
	if (current?.noteId === location.noteId) return history;
	const entries = [...history.entries.slice(0, history.index + 1), location].slice(-200);
	return { entries, index: entries.length - 1 };
};

export const findHistoryIndex = (history: NavigationHistory, direction: -1 | 1, noteIds: ReadonlySet<string>): number => {
	for (let index = history.index + direction; index >= 0 && index < history.entries.length; index += direction) {
		const location = history.entries[index];
		if (noteIds.has(location.noteId)) return index;
	}
	return -1;
};
