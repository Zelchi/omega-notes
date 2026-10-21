export const kanbanStatuses = ["backlog", "toDo", "inProgress", "review", "finish"] as const;
export const maxKanbanPosition = 1000;

export type KanbanStatus = typeof kanbanStatuses[number];
export type KanbanItem = { id: string; title: string; status: KanbanStatus; position: number; createdAt: number | null; updatedAt: number | null };

export const kanbanStatusLabels = {
	backlog: "kanbanStatusBacklog",
	toDo: "kanbanStatusToDo",
	inProgress: "kanbanStatusInProgress",
	review: "kanbanStatusReview",
	finish: "kanbanStatusFinish",
} as const;
