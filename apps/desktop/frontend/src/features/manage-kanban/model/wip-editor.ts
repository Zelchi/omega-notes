import type { KanbanStatus } from "./kanban";

type WipInput = Pick<HTMLInputElement, "valueAsNumber" | "contains"> & EventTarget;

export const createKanbanWipEditorHandlers = (options: {
	readStatus: () => KanbanStatus | undefined;
	readInput: () => WipInput | undefined;
	setLimit: (status: KanbanStatus, limit: number | undefined) => void;
	close: () => void;
	isInsideInput: (target: EventTarget | null, input: WipInput) => boolean;
}) => {
	const finish = (status: KanbanStatus, input: WipInput) => {
		if (options.readStatus() !== status) return;
		const value = input.valueAsNumber;
		options.setLimit(status, Number.isNaN(value) || value === 0 ? undefined : value);
		options.close();
	};

	const commitOutside = (target: EventTarget | null) => {
		const status = options.readStatus();
		const input = options.readInput();
		if (!status || !input || options.isInsideInput(target, input)) return;
		finish(status, input);
	};

	return { finish, commitOutside };
};
