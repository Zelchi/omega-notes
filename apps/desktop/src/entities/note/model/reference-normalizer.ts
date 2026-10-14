import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { StudyNote } from "./note";
import { normalizeNoteTitle } from "./note-titles";

export const createNoteReferenceNormalizer = () => {
    const targets = new Map<string, string>();
    const titles = new Map<string, string>();
    const rememberedTitles = new Map<string, string>();
    return {
        bind: (notes: StudyNote[]) => {
            if (notes.length === titles.size && notes.every((note) => titles.get(note.id) === note.title)) return false;
            // Keep previous names during an ongoing response, while storing references by ID.
            for (const note of notes) targets.set(normalizeNoteTitle(note.title), note.id);
            for (const note of notes) targets.set(normalizeNoteTitle(note.id), note.id);
            titles.clear();
            for (const note of notes) {
                titles.set(note.id, note.title);
                rememberedTitles.set(note.id, note.title);
            }
            return true;
        },
        title: (id: string): string | undefined => rememberedTitles.get(id),
        normalize: (text: string): string => mapTextOutsideCode(text, (prose) => prose.replace(/\[\[([^\]\r\n]+)\]\]/g, (reference, body: string) => {
            const separator = body.indexOf("|");
            const target = separator < 0 ? body : body.slice(0, separator);
            const id = targets.get(normalizeNoteTitle(target));
            if (!id) return reference;
            const alias = separator < 0 ? "" : body.slice(separator);
            return `[[${id}${alias}]]`;
        })),
    };
};
