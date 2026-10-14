import { createSignal, onCleanup, type Accessor } from "solid-js";
import { bindNoteReferences, canCreateNoteReference, createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference,
    type NotesLibrary, type StudyNote } from "@/entities/note";

export const useCreateNoteFromLink = (options: {
    notes: NotesLibrary;
    vaultId: Accessor<string | undefined>;
    sourceNoteId: Accessor<string | undefined>;
    enabled: Accessor<boolean>;
    beforeOpen: () => Promise<boolean>;
    onOpenNote: (note: StudyNote) => Promise<void>;
}) => {
    const [pending, setPending] = createSignal(false);
    const [error, setError] = createSignal(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    onCleanup(() => { disposed = true; clearTimeout(timer); });
    const resolve = (target: string) => resolveNoteReference(target,
        new Map(options.notes.notes().map((note) => [normalizeNoteTitle(note.id), note])), createNoteTitleIndex(options.notes.notes()));
    const open = async (target: string): Promise<void> => {
        const vaultId = options.vaultId();
        const sourceId = options.sourceNoteId();
        if (pending() || !options.enabled() || !vaultId || !canCreateNoteReference(target)) return;
        setPending(true);
        setError(false);
        try {
            if (!(await options.beforeOpen())) throw new Error("SAVE_FAILED");
            if (disposed || vaultId !== options.vaultId() || sourceId !== options.sourceNoteId()) return;
            let note = resolve(target);
            if (!note) {
                try { note = await options.notes.create(target.trim()); }
                catch (cause) {
                    // Another action may have created this title while the request was in flight.
                    note = resolve(target);
                    if (!note) throw cause;
                }
            }
            if (disposed || vaultId !== options.vaultId() || sourceId !== options.sourceNoteId()) return;
            const source = options.notes.notes().find((item) => item.id === sourceId);
            if (source) {
                const document = bindNoteReferences(source.document, target, note.id);
                if (document !== source.document) options.notes.updateDocument(source.id, document);
            }
            if (!(await options.notes.flushSave())) throw new Error("SAVE_FAILED");
            if (!disposed && vaultId === options.vaultId() && sourceId === options.sourceNoteId()) await options.onOpenNote(note);
        } catch (cause) {
            console.error(cause);
            if (!disposed) {
                setError(true);
                clearTimeout(timer);
                timer = setTimeout(() => setError(false), 3000);
            }
        } finally { if (!disposed) setPending(false); }
    };
    return { open, pending, error };
};
