import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { StudyNote } from "./note";
import { normalizeNoteTitle } from "./note-titles";

export const createEditableNoteReferences = (notes: readonly Pick<StudyNote, "id" | "title">[]) => {
	const ids = new Set(notes.map((note) => normalizeNoteTitle(note.id)));
	const titleCounts = new Map<string, number>();
	for (const note of notes) {
		const title = normalizeNoteTitle(note.title);
		titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
	}
	const titlesById = new Map<string, string>();
	const idsByTitle = new Map<string, string>();
	for (const note of notes) {
		const title = normalizeNoteTitle(note.title);
		if (!title || /[\[\]|`\r\n]/.test(note.title) || ids.has(title) || titleCounts.get(title) !== 1) continue;
		titlesById.set(normalizeNoteTitle(note.id), note.title);
		idsByTitle.set(note.title, note.id);
	}
	const rewrite = (text: string, target: (name: string) => string | undefined): string => {
		if (!text.includes("[[")) return text;
		return mapTextOutsideCode(text, (prose) => prose.replace(/\[\[([^\]\r\n]+)\]\]/g, (reference, body: string) => {
			const separator = body.indexOf("|");
			const name = separator < 0 ? body : body.slice(0, separator);
			const replacement = target(name);
			return replacement === undefined ? reference : `[[${replacement}${separator < 0 ? "" : body.slice(separator)}]]`;
		}));
	};
	return {
		display: (text: string) => rewrite(text, (name) => titlesById.get(normalizeNoteTitle(name))),
		store: (text: string) => rewrite(text, (name) => idsByTitle.get(name)),
	};
};
