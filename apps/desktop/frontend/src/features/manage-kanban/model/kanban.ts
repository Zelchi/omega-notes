export const kanbanStatuses = ["backlog", "toDo", "inProgress", "review", "finish"] as const;
export const kanbanPriorities = ["none", "low", "medium", "high"] as const;
export const maxKanbanItems = 1000;
export const maxKanbanPosition = 1000;
export const isValidKanbanDueDate = (value: string) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export type KanbanStatus = typeof kanbanStatuses[number];
export type KanbanPriority = typeof kanbanPriorities[number];
export type KanbanItem = {
	id: string;
	title: string;
	/** Retained only for compatibility with cards saved before note links were added. */
	description: string;
	noteId: string | null;
	status: KanbanStatus;
	position: number;
	priority: KanbanPriority;
	labels: string[];
	dueDate: string | null;
	createdAt: number | null;
	updatedAt: number | null;
};
export type KanbanWipLimits = Partial<Record<KanbanStatus, number>>;
export type KanbanData = { items: KanbanItem[]; wipLimits: KanbanWipLimits };

export const kanbanStatusLabels = {
	backlog: "kanbanStatusBacklog",
	toDo: "kanbanStatusToDo",
	inProgress: "kanbanStatusInProgress",
	review: "kanbanStatusReview",
	finish: "kanbanStatusFinish",
} as const;

export const kanbanPriorityLabels = {
	none: "kanbanPriorityNone",
	low: "kanbanPriorityLow",
	medium: "kanbanPriorityMedium",
	high: "kanbanPriorityHigh",
} as const;
