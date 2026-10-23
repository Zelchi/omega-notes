import type { NoteMediaSource } from "@/entities/note";

export type ImportedImage = Extract<NoteMediaSource, { type: "image" }>;
export type ImportedMedia = NoteMediaSource;
