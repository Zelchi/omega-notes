import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import type { NoteSummary } from "./note";
type NoteName = Pick<NoteSummary, "id" | "title">;
import { createNoteTitleIndex, normalizeNoteTitle } from "./note-titles";

export const createNoteReferenceNormalizer = () => {
    const targets = new Map<string, string>();
    const titles = new Map<string, string>();
    const rememberedTitles = new Map<string, string>();
    return {
        bind: (notes: readonly NoteName[]) => {
            const nextTargets = new Map<string, string>();
            for (const [title, note] of createNoteTitleIndex(notes)) nextTargets.set(title, note.id);
            for (const note of notes) nextTargets.set(normalizeNoteTitle(note.id), note.id);
            const changed = nextTargets.size !== targets.size || [...nextTargets].some(([key, id]) => targets.get(key) !== id) ||
                notes.length !== titles.size || notes.some((note) => titles.get(note.id) !== note.title);
            if (!changed) return false;
            targets.clear();
            for (const [key, id] of nextTargets) targets.set(key, id);
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
