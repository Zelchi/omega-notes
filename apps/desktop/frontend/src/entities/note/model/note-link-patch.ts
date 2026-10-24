import type { NoteDocument } from "./note-document";

export type NoteLinkPatch = {
    operation: "link" | "unlink";
    noteId: string;
    title: string;
    expectedDocument: NoteDocument;
    document: NoteDocument;
    links: { id: string; title: string; reference: string; label: string }[];
};
