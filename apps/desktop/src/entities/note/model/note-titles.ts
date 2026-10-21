import type { NoteSummary } from "./note";

type NoteName = Pick<NoteSummary, "id" | "title">;

export const normalizeNoteTitle = (title: string): string => {
	return title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
};

export const createNoteTitleIndex = <T extends NoteName>(notes: readonly T[]): Map<string, T> => {
	const index = new Map<string, T>();
	const stableOrder = [...notes].sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
	for (const note of stableOrder) {
		const key = normalizeNoteTitle(note.title);
		if (key && !index.has(key)) index.set(key, note);
	}
	return index;
};

export const resolveNoteReference = <T extends NoteName>(
	target: string,
	notesById: Map<string, T>,
	notesByTitle: Map<string, T>,
): T | undefined => {
	const normalizedTarget = normalizeNoteTitle(target);
	return notesById.get(normalizedTarget) ?? notesByTitle.get(normalizedTarget);
};

export const isNoteTitleAvailable = (notes: readonly NoteName[], title: string, excludedId?: string): boolean => {
	const normalizedTitle = normalizeNoteTitle(title);
	if (!normalizedTitle) return false;
	const current = notes.find((note) => note.id === excludedId);
	if (current && normalizeNoteTitle(current.title) === normalizedTitle) return true;
	return !notes.some((note) => note.id !== excludedId && normalizeNoteTitle(note.title) === normalizedTitle);
};
