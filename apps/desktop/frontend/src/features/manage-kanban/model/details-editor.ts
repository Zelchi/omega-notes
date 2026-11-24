import type { KanbanItem } from "./kanban";

export const createKanbanDetailsDraft = (
	item: KanbanItem,
	resolveNoteQuery: (noteId: string) => string,
) => ({
	id: item.id,
	title: item.title,
	noteId: item.noteId,
	noteQuery: item.noteId ? resolveNoteQuery(item.noteId) : "",
	notePickerOpen: false,
	noteLinkError: false,
	priority: item.priority === "none" ? "low" : item.priority,
	labels: item.labels.join(", "),
	dueDate: item.dueDate ?? "",
});
