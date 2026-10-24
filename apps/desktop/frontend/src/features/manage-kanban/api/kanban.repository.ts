import { invoke } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import { kanbanStatuses, maxKanbanItems, maxKanbanPosition, type KanbanItem, type KanbanStatus } from "../model/kanban";

const key = (vaultId: string) => `omega-notes.kanban.v1.${vaultId}`;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const maxDateTimestamp = 8_640_000_000_000_000;

const timestamp = (value: unknown): number | null => {
	if (value === undefined || value === null) return null;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maxDateTimestamp) throw Error("KANBAN_STORAGE_FAILED");
	return value;
};

const decode = (value: unknown): KanbanItem[] => {
	if (!Array.isArray(value) || value.length > maxKanbanItems) throw Error("KANBAN_STORAGE_FAILED");
	const ids = new Set<string>();
	const entries = value.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw Error("KANBAN_STORAGE_FAILED");
		const item = entry as Record<string, unknown>;
		if (typeof item.id !== "string" || !idPattern.test(item.id) || ids.has(item.id)
			|| typeof item.title !== "string" || !item.title.trim() || item.title.length > 500
			|| !kanbanStatuses.includes(item.status as KanbanItem["status"])) throw Error("KANBAN_STORAGE_FAILED");
		ids.add(item.id);
		const status = item.status as KanbanStatus;
		const createdAt = timestamp(item.createdAt);
		const updatedAt = timestamp(item.updatedAt);
		let position: number | undefined;
		if (item.position !== undefined && item.position !== null) {
			if (typeof item.position !== "number" || !Number.isSafeInteger(item.position)
				|| item.position < 0 || item.position > maxKanbanPosition) throw Error("KANBAN_STORAGE_FAILED");
			position = item.position;
		}
		return {
			id: item.id,
			title: item.title,
			status,
			position,
			createdAt,
			updatedAt: updatedAt === createdAt ? null : updatedAt,
		};
	});
	const reserved = new Map<KanbanStatus, Set<number>>(kanbanStatuses.map((status) => [status, new Set()]));
	for (const item of entries) {
		if (item.position === undefined) continue;
		const positions = reserved.get(item.status)!;
		if (positions.has(item.position)) throw Error("KANBAN_STORAGE_FAILED");
		positions.add(item.position);
	}
	const nextPosition = new Map<KanbanStatus, number>(kanbanStatuses.map((status) => [status, 0]));
	return entries.map((item) => {
		if (item.position !== undefined) return item as KanbanItem;
		const positions = reserved.get(item.status)!;
		let position = nextPosition.get(item.status)!;
		while (positions.has(position) && position <= maxKanbanPosition) position += 1;
		if (position > maxKanbanPosition) throw Error("KANBAN_STORAGE_FAILED");
		positions.add(position);
		nextPosition.set(item.status, position + 1);
		return { ...item, position } as KanbanItem;
	});
};

export const readKanban = async (vaultId: string): Promise<KanbanItem[]> => {
	if (isDesktopRuntime()) return decode(await invoke("read_kanban", { vaultId }));
	try {
		const saved = localStorage.getItem(key(vaultId));
		return saved === null ? [] : decode(JSON.parse(saved));
	} catch {
		throw Error("KANBAN_STORAGE_FAILED");
	}
};

export const saveKanban = async (vaultId: string, items: KanbanItem[]): Promise<void> => {
	const safe = decode(items);
	if (isDesktopRuntime()) {
		await invoke("save_kanban", { vaultId, items: safe });
		return;
	}
	try {
		localStorage.setItem(key(vaultId), JSON.stringify(safe));
	} catch {
		throw Error("KANBAN_STORAGE_FAILED");
	}
};
