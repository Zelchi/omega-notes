import type { NoteMediaSource } from "@/entities/note";

export type ImportedImage = Extract<NoteMediaSource, { type: "image" }>;
export type ImportedAudio = Extract<NoteMediaSource, { type: "audio" }>;
export type ImportedVideo = Extract<NoteMediaSource, { type: "video" }>;
export type ImportedMedia = NoteMediaSource;
