/** References only: the host reads and deduplicates the actual note contents after saving edits. */
export type StudyContextAssignment = {
	itemId: string;
	noteId: string;
	sourceIds: string[];
	supportingNoteIds: string[];
};
export type StudyContext = { items: StudyContextAssignment[] };
export type AiTaskPurpose = "chat" | "study-generation" | "study-evaluation";
