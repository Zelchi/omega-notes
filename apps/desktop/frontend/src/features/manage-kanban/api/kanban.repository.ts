import { invoke } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import { isValidKanbanDueDate, kanbanPriorities, kanbanStatuses, maxKanbanItems, maxKanbanPosition, type KanbanData, type KanbanItem, type KanbanPriority, type KanbanStatus, type KanbanWipLimits } from "../model/kanban";

const key = (vaultId: string) => `omega-notes.kanban.v1.${vaultId}`;
const wipLimitsKey = (vaultId: string) => `omega-notes.kanban.wip.v1.${vaultId}`;
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
		const description = item.description ?? "";
		const noteId = item.noteId ?? null;
		const priority = item.priority ?? "none";
		const labels = item.labels ?? [];
		const dueDate = item.dueDate ?? null;
		if (typeof description !== "string" || description.length > 5000
			|| (noteId !== null && (typeof noteId !== "string" || !idPattern.test(noteId)))
			|| !kanbanPriorities.includes(priority as KanbanPriority)
			|| !Array.isArray(labels) || labels.length > 8
			|| labels.some(label => typeof label !== "string" || !label.trim() || label.length > 32)
			|| new Set(labels).size !== labels.length
			|| (dueDate !== null && (typeof dueDate !== "string" || !isValidKanbanDueDate(dueDate)))) {
			throw Error("KANBAN_STORAGE_FAILED");
		}
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
			description,
			noteId,
			status,
			position,
			priority: priority as KanbanPriority,
			labels: labels as string[],
			dueDate,
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

const decodeWipLimits = (value: unknown): KanbanWipLimits => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter(([status, limit]) =>
		kanbanStatuses.includes(status as KanbanStatus)
		&& Number.isSafeInteger(limit) && (limit as number) >= 1 && (limit as number) <= maxKanbanItems,
	)) as KanbanWipLimits;
};

const decodeData = (value: unknown): KanbanData => {
	if (Array.isArray(value)) return { items: decode(value), wipLimits: {} };
	if (!value || typeof value !== "object") throw Error("KANBAN_STORAGE_FAILED");
	const data = value as Record<string, unknown>;
	return { items: decode(data.items), wipLimits: decodeWipLimits(data.wipLimits) };
};

const readLegacyWipLimits = (vaultId: string): { raw: string | null; limits: KanbanWipLimits } => {
	let raw: string | null;
	try {
		raw = localStorage.getItem(wipLimitsKey(vaultId));
	} catch { return { raw: null, limits: {} }; }
	if (raw === null) return { raw: null, limits: {} };
	try { return { raw, limits: decodeWipLimits(JSON.parse(raw)) }; }
	catch { return { raw, limits: {} }; }
};

const removeLegacyWipLimits = (vaultId: string): void => {
	try { localStorage.removeItem(wipLimitsKey(vaultId)); }
	catch (error) { console.error(error); }
};

export const readKanban = async (vaultId: string): Promise<KanbanData> => {
	let saved: unknown;
	if (isDesktopRuntime()) saved = await invoke("read_kanban", { vaultId });
	else {
		try {
			const raw = localStorage.getItem(key(vaultId));
			saved = raw === null ? [] : JSON.parse(raw);
		} catch { throw Error("KANBAN_STORAGE_FAILED"); }
	}
	const data = decodeData(saved);
	const legacy = readLegacyWipLimits(vaultId);
	if (legacy.raw !== null) {
		if (Object.keys(data.wipLimits).length === 0) {
			data.wipLimits = legacy.limits;
			try {
				await saveKanban(vaultId, data.items, data.wipLimits);
				removeLegacyWipLimits(vaultId);
			} catch (error) { console.error(error); }
		} else removeLegacyWipLimits(vaultId);
	}
	return data;
};

export const saveKanban = async (vaultId: string, items: KanbanItem[], wipLimits: KanbanWipLimits): Promise<void> => {
	const safe = decode(items);
	const safeWipLimits = decodeWipLimits(wipLimits);
	if (isDesktopRuntime()) {
		await invoke("save_kanban", { vaultId, items: safe, wipLimits: safeWipLimits });
		removeLegacyWipLimits(vaultId);
		return;
	}
	try {
		localStorage.setItem(key(vaultId), JSON.stringify({ items: safe, wipLimits: safeWipLimits }));
		removeLegacyWipLimits(vaultId);
	} catch {
		throw Error("KANBAN_STORAGE_FAILED");
	}
};
