import type { NoteDocument } from "./note-document";

export type StudyNote = {
	id: string;
	title: string;
	document: NoteDocument;
	updatedAt: number;
};

export type NoteMediaSource =
	| { type: "image"; imageId: string }
	| { type: "image"; dataUrl: string }
	| { type: "audio"; audioId: string; extension: string }
	| { type: "audio"; dataUrl: string; extension: string }
	| { type: "video"; videoId: string; extension: string }
	| { type: "video"; dataUrl: string; extension: string };

export type NoteMediaCatalogItem = {
	noteId: string;
	noteTitle: string;
	elementId: string;
	source: NoteMediaSource;
};

export type NoteSummary = {
	id: string;
	title: string;
	displayTitle?: string;
	updatedAt: number;
	links: string[];
	hasContent: boolean;
	hasText: boolean;
	studyContentCharacters: number;
	studyContentWords: number;
	studyContentLines: number;
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

export type NoteSummaryLibrary = Omit<NoteLibrary, "notes"> & { notes: NoteSummary[] };

export type NoteChangeSet = {
	fullResync: boolean;
	changeToken: string | null;
	changedIds: string[];
	removedIds: string[];
	notes: NoteSummary[];
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
