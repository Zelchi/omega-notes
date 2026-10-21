import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { NoteSummary, StudyNote } from "./note";
import { parseNoteTextLinks } from "./text-links";

export const summarizeNote = (note: StudyNote): NoteSummary => {
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
		preview: note.preview,
		updatedAt: note.updatedAt,
		links: [...links].sort(),
		hasContent: note.document.elements.some((element) => element.type !== "text" || element.text.trim().length > 0),
		hasText: note.document.elements.some((element) => element.type === "text" && element.text.trim().length > 0),
	};
};
