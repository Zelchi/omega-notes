import type { NoteTextAlignment } from "@/entities/note";

export type TextHistoryState = {
    text: string;
    paragraphAlignments?: NoteTextAlignment[];
    selection: { start: number; end: number };
    scrollTop: number;
};
type Entry = { before: TextHistoryState; after: TextHistoryState; kind: string; time: number };

const sameContent = (a: TextHistoryState, b: TextHistoryState): boolean =>
    a.text === b.text && (a.paragraphAlignments?.length ?? 0) === (b.paragraphAlignments?.length ?? 0) &&
    (a.paragraphAlignments ?? []).every((alignment, index) => alignment === b.paragraphAlignments?.[index]);

export const createTextHistory = () => {
    const past: Entry[] = [];
    const future: Entry[] = [];
    let allowGrouping = false;
    return {
        clear: () => { past.length = 0; future.length = 0; allowGrouping = false; },
        record: (before: TextHistoryState, after: TextHistoryState, kind = "replace") => {
            if (sameContent(before, after)) return;
            const time = performance.now();
            const last = past.at(-1);
            const urlPaste = kind.startsWith("url-paste:");
            const canGroup = allowGrouping && last && last.kind === kind &&
                (["insertText", "deleteContentBackward", "deleteContentForward"].includes(kind) || kind.startsWith("table-input:") || urlPaste) &&
                time - last.time < (urlPaste ? 15_000 : 750) && sameContent(last.after, before) &&
                before.selection.start === before.selection.end &&
                before.selection.start === last.after.selection.end;
            if (canGroup) { last.after = after; last.time = time; }
            else past.push({ before, after, kind, time });
            if (past.length > 100) past.shift();
            future.length = 0;
            allowGrouping = true;
        },
        undo: (): TextHistoryState | undefined => {
            allowGrouping = false;
            const entry = past.pop();
            if (!entry) return;
            future.push(entry);
            return entry.before;
        },
        redo: (): TextHistoryState | undefined => {
            allowGrouping = false;
            const entry = future.pop();
            if (!entry) return;
            past.push(entry);
            return entry.after;
        },
    };
};
