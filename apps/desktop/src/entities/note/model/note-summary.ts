import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { NoteSummary, StudyNote } from "./note";
import { documentText } from "./note-document";
import { parseNoteTextLinks } from "./text-links";

export const summarizeNote = (note: StudyNote): NoteSummary => {
	const text = documentText(note.document);
	const whitespaceOnly = /^\p{White_Space}*$/u;
	const links = new Set<string>();
	for (const element of note.document.elements) {
		if (element.type !== "text" || !element.text.includes("[[")) continue;
		mapTextOutsideCode(element.text, (prose) => {
			for (const link of parseNoteTextLinks(prose)) {
				if (link.kind === "note" && link.target) links.add(link.target);
			}
			return prose;
		});
	}
	return {
		id: note.id,
		title: note.title,
		updatedAt: note.updatedAt,
		links: [...links].sort(),
		hasContent: note.document.elements.some((element) => element.type !== "text" || element.text.trim().length > 0),
		hasText: !whitespaceOnly.test(text),
		studyContentCharacters: [...text].length,
		studyContentWords: text.split(/\p{White_Space}+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length,
		studyContentLines: text.split(/\r?\n/u).filter((line) => !whitespaceOnly.test(line)).reduce((count, line) => count + Math.ceil([...line].length / 80), 0),
	};
};
