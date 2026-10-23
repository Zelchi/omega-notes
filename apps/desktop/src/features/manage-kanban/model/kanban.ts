export const kanbanStatuses = ["backlog", "toDo", "inProgress", "review", "finish"] as const;
export const maxKanbanItems = 1000;
export const maxKanbanPosition = 1000;
export const kanbanSlotCount = (lastPosition: number) => Math.min(maxKanbanPosition + 1, Math.max(5, lastPosition + 2));

export type KanbanStatus = typeof kanbanStatuses[number];
export type KanbanItem = { id: string; title: string; status: KanbanStatus; position: number; createdAt: number | null; updatedAt: number | null };

export const kanbanStatusLabels = {
	backlog: "kanbanStatusBacklog",
	toDo: "kanbanStatusToDo",
	inProgress: "kanbanStatusInProgress",
	review: "kanbanStatusReview",
	finish: "kanbanStatusFinish",
} as const;
