import type { NoteDocument } from "./note-document";

export type StudyNote = {
	id: string;
	title: string;
	document: NoteDocument;
	updatedAt: number;
	preview: string;
};

export type NoteLoadIssue = {
	fileName: string;
	message: string;
	recoveryPath: string | null;
	recovered: boolean;
};

export type NoteSaveResult = {
	note: StudyNote;
	cleanupIssues: NoteLoadIssue[];
};

export type NoteLibrary = {
	notes: StudyNote[];
	issues: NoteLoadIssue[];
	referenceTitles: Record<string, string>;
};

export type NoteStorageStats = {
	noteCount: number;
	imageCount: number;
	audioCount: number;
	videoCount: number;
	characterCount: number;
	storageBytes: number;
	lastModifiedAt: number;
};
