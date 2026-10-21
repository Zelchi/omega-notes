import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { NoteSummary } from "./note";
import type { NoteDocument } from "./note-document";
import { createNoteTitleIndex, normalizeNoteTitle } from "./note-titles";

type NoteName = Pick<NoteSummary, "id" | "title">;

export const renameResolvedNoteLinks = (
	document: NoteDocument,
	previousTitle: string,
	nextTitle: string,
	notes: readonly NoteName[],
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
	titleIndex: Map<string, NoteName>,
	idIndex: Map<string, NoteName>,
): string => {
	const previousKey = normalizeNoteTitle(previousTitle);
	return mapTextOutsideCode(content, (prose) => prose.replace(/\[\[([^\]\r\n]+)\]\]/g, (link, targetAndAlias: string) => {
		const separator = targetAndAlias.indexOf("|");
		const rawTarget = separator < 0 ? targetAndAlias : targetAndAlias.slice(0, separator);
		const normalizedTarget = normalizeNoteTitle(rawTarget);
		if (normalizedTarget !== previousKey || idIndex.has(normalizedTarget)) return link;
		if (titleIndex.get(normalizedTarget)?.id !== renamedId) return link;
		const alias = separator < 0 ? "" : targetAndAlias.slice(separator);
		return `[[${nextTitle}${alias}]]`;
	}));
};

export const canCreateNoteReference = (target: string): boolean => Boolean(target.trim()) && !/[\r\n]/.test(target) &&
	!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(target.trim());

export const bindNoteReferences = (document: NoteDocument, title: string, noteId: string): NoteDocument => {
	const target = normalizeNoteTitle(title);
	let changed = false;
	const elements = document.elements.map((element) => {
		if (element.type !== "text") return element;
		const text = mapTextOutsideCode(element.text, (prose) => prose.replace(/\[\[([^\]\r\n]+)\]\]/g, (reference, body: string) => {
			const separator = body.indexOf("|");
			const name = separator < 0 ? body : body.slice(0, separator);
			if (normalizeNoteTitle(name) !== target) return reference;
			return `[[${noteId}${separator < 0 ? "" : body.slice(separator)}]]`;
		}));
		if (text === element.text) return element;
		changed = true;
		return { ...element, text };
	});
	return changed ? { ...document, elements } : document;
};
