/** Somente referências: o aplicativo host lê e elimina duplicatas do conteúdo real das notas depois de salvar as alterações. */
export type StudyContextAssignment = {
	itemId: string;
	candidateId: string;
	noteId: string;
	sourceIds: string[];
	supportingNoteIds: string[];
};
export type StudyContext = { items: StudyContextAssignment[] };
export type AiTaskPurpose = "chat" | "study-generation" | "study-evaluation";
