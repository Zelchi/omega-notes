import type { StudyNote } from "./note";

export const normalizeNoteTitle = (title: string): string => {
	return title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
};

export const createNoteTitleIndex = (notes: StudyNote[]): Map<string, StudyNote> => {
	const index = new Map<string, StudyNote>();
	const stableOrder = [...notes].sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
	for (const note of stableOrder) {
		const key = normalizeNoteTitle(note.title);
		if (key && !index.has(key)) index.set(key, note);
	}
	return index;
};

export const resolveNoteReference = (
	target: string,
	notesById: Map<string, StudyNote>,
	notesByTitle: Map<string, StudyNote>,
): StudyNote | undefined => {
	const normalizedTarget = normalizeNoteTitle(target);
	return notesById.get(normalizedTarget) ?? notesByTitle.get(normalizedTarget);
};

export const isNoteTitleAvailable = (notes: StudyNote[], title: string, excludedId?: string): boolean => {
	const normalizedTitle = normalizeNoteTitle(title);
	if (!normalizedTitle) return false;
	const current = notes.find((note) => note.id === excludedId);
	if (current && normalizeNoteTitle(current.title) === normalizedTitle) return true;
	return !notes.some((note) => note.id !== excludedId && normalizeNoteTitle(note.title) === normalizedTitle);
};
