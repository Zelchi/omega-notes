import type { StudyNote } from "./note";
import type { NoteDocument } from "./note-document";
import { createNoteTitleIndex, normalizeNoteTitle } from "./note-titles";

export const renameResolvedNoteLinks = (
	document: NoteDocument,
	previousTitle: string,
	nextTitle: string,
	notes: StudyNote[],
	renamedId: string,
): NoteDocument => {
	const titleIndex = createNoteTitleIndex(notes);
	const idIndex = new Map(notes.map((note) => [normalizeNoteTitle(note.id), note]));
	const previousKey = normalizeNoteTitle(previousTitle);
	if (titleIndex.get(previousKey)?.id !== renamedId) return document;

	let changed = false;
	const elements = document.elements.map((element) => {
		if (element.type !== "text") return element;
		const text = rewriteTextLinks(element.text, previousTitle, nextTitle, renamedId, titleIndex, idIndex);
		if (text === element.text) return element;
		changed = true;
		return { ...element, text };
	});
	return changed ? { ...document, elements } : document;
};

const rewriteTextLinks = (
	content: string,
	previousTitle: string,
	nextTitle: string,
	renamedId: string,
	titleIndex: Map<string, StudyNote>,
	idIndex: Map<string, StudyNote>,
): string => {
	const previousKey = normalizeNoteTitle(previousTitle);
	return content.replace(/\[\[([^\]]+)\]\]/g, (link, targetAndAlias: string) => {
		const separator = targetAndAlias.indexOf("|");
		const rawTarget = separator < 0 ? targetAndAlias : targetAndAlias.slice(0, separator);
		const normalizedTarget = normalizeNoteTitle(rawTarget);
		if (normalizedTarget !== previousKey || idIndex.has(normalizedTarget)) return link;
		if (titleIndex.get(normalizedTarget)?.id !== renamedId) return link;
		const alias = separator < 0 ? "" : targetAndAlias.slice(separator);
		return `[[${nextTitle}${alias}]]`;
	});
};
