import type { NoteSummary } from "./note";

type NoteName = Pick<NoteSummary, "id" | "title">;
export const NOTE_TITLE_MAX_LENGTH = 64;

const uuidV7Timestamp = (id: string): number | undefined => {
	const hexadecimal = id.replaceAll("-", "");
	if (!/^[\da-f]{32}$/i.test(hexadecimal) || hexadecimal[12]?.toLocaleLowerCase() !== "7") return undefined;
	return Number.parseInt(hexadecimal.slice(0, 12), 16);
};

const compareCreatedAt = (first: NoteName, second: NoteName): number => {
	const firstTimestamp = uuidV7Timestamp(first.id);
	const secondTimestamp = uuidV7Timestamp(second.id);
	if (firstTimestamp !== undefined && secondTimestamp !== undefined && firstTimestamp !== secondTimestamp) {
		return firstTimestamp - secondTimestamp;
	}
	if (firstTimestamp !== undefined && secondTimestamp === undefined) return -1;
	if (firstTimestamp === undefined && secondTimestamp !== undefined) return 1;
	return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
};

export const normalizeNoteTitle = (title: string): string => {
	return title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
};

export const createNoteTitleIndex = <T extends NoteName>(notes: readonly T[]): Map<string, T> => {
	const index = new Map<string, T>();
	const stableOrder = [...notes].sort(compareCreatedAt);
	for (const note of stableOrder) {
		const key = normalizeNoteTitle(note.title);
		if (key && !index.has(key)) index.set(key, note);
	}
	return index;
};

export const createNoteDisplayTitleIndex = (notes: readonly NoteName[]): Map<string, string> => {
	const groups = new Map<string, NoteName[]>();
	for (const note of notes) {
		const key = normalizeNoteTitle(note.title);
		if (!key) continue;
		const group = groups.get(key) ?? [];
		group.push(note);
		groups.set(key, group);
	}

	const titles = new Map<string, string>();
	for (const group of groups.values()) {
		if (group.length < 2) continue;
		group.sort(compareCreatedAt).forEach((note, index) => titles.set(note.id, `${note.title} #${index + 1}`));
	}
	return titles;
};

export const displayNoteTitle = (note: Pick<NoteSummary, "title" | "displayTitle">): string => note.displayTitle ?? note.title;

export const resolveNoteReference = <T extends NoteName>(
	target: string,
	notesById: Map<string, T>,
	notesByTitle: Map<string, T>,
): T | undefined => {
	const normalizedTarget = normalizeNoteTitle(target);
	return notesById.get(normalizedTarget) ?? notesByTitle.get(normalizedTarget);
};
