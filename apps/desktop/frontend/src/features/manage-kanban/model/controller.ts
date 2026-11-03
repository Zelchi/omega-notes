import { createEffect, createSignal, on } from "solid-js";
import type { Accessor } from "solid-js";
import { readKanban, saveKanban } from "../api/kanban.repository";
import { isValidKanbanDueDate, kanbanPriorities, kanbanStatuses, maxKanbanItems, maxKanbanPosition, type KanbanItem, type KanbanPriority, type KanbanStatus, type KanbanWipLimits } from "./kanban";

export const useKanban = (vaultId: Accessor<string | undefined>) => {
	const [open, setOpen] = createSignal(false);
	const [panelWidth, setPanelWidth] = createSignal(420);
	const [panelStage, setPanelStage] = createSignal(1);
	const [items, setItems] = createSignal<KanbanItem[]>([]);
	const [wipLimits, setWipLimits] = createSignal<KanbanWipLimits>({});
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal(false);
	const [readFailed, setReadFailed] = createSignal(false);
	const [adding, setAdding] = createSignal<KanbanStatus>();
	const [draft, setDraft] = createSignal("");
	const [collapsedStatuses, setCollapsedStatuses] = createSignal<Set<KanbanStatus>>(new Set());
	const view = { adding, setAdding, draft, setDraft, collapsedStatuses, setCollapsedStatuses };
	let loadRevision = 0;
	let writeRevision = 0;
	const writes = new Map<string, Promise<void>>();

	const load = (id: string, revision: number) => {
		setLoading(true);
		const pendingWrite = writes.get(id);
		void (pendingWrite ? pendingWrite.catch(() => undefined) : Promise.resolve()).then(() => readKanban(id)).then((saved) => {
			if (revision === loadRevision && vaultId() === id) {
				setItems(saved.items);
				setWipLimits(saved.wipLimits);
				setReadFailed(false);
			}
		}).catch(() => {
			if (revision === loadRevision && vaultId() === id) setReadFailed(true);
		}).finally(() => {
			if (revision === loadRevision) setLoading(false);
		});
	};

	createEffect(on(vaultId, (id) => {
		const revision = ++loadRevision;
		setOpen(false);
		setItems([]);
		setWipLimits({});
		setError(false);
		setReadFailed(false);
		setAdding(undefined); setDraft("");
		setCollapsedStatuses(new Set<KanbanStatus>());
		if (!id) { setLoading(false); return; }
		load(id, revision);
	}, { defer: false }));

	const persist = (id: string, next: KanbanItem[], nextWipLimits = wipLimits()) => {
		if (loading() || readFailed()) return;
		const revision = ++writeRevision;
		setItems(next);
		setWipLimits(nextWipLimits);
		setError(false);
		const previous = writes.get(id) ?? Promise.resolve();
		const pending = previous.catch(() => undefined).then(() => saveKanban(id, next, nextWipLimits));
		writes.set(id, pending);
		void pending.then(() => {
			if (vaultId() === id && revision === writeRevision) setError(false);
		}, () => {
			if (vaultId() === id && revision === writeRevision) setError(true);
		}).finally(() => {
			if (writes.get(id) === pending) writes.delete(id);
		});
	};

	const retryRead = () => {
		const id = vaultId();
		if (!id || loading() || !readFailed()) return;
		load(id, ++loadRevision);
	};

	const flushSave = async () => {
		const id = vaultId();
		if (!id) return true;
		while (writes.has(id)) {
			try { await writes.get(id); }
			catch { return false; }
		}
		return !error();
	};

	const add = (title: string, status: KanbanStatus) => {
		const id = vaultId();
		const normalized = title.trim();
		const current = items();
		if (!id || loading() || readFailed() || !normalized || normalized.length > 500 || !kanbanStatuses.includes(status) || current.length >= maxKanbanItems) return;
		const now = Date.now();
		const occupied = new Set(current.filter((item) => item.status === status).map((item) => item.position));
		let position = Math.max(-1, ...occupied) + 1;
		if (position > maxKanbanPosition) {
			position = 0;
			while (occupied.has(position) && position <= maxKanbanPosition) position += 1;
		}
		if (position > maxKanbanPosition) return;
		persist(id, [...current, { id: crypto.randomUUID(), title: normalized, description: "", noteId: null, status, position, priority: "low", labels: [], dueDate: null, createdAt: now, updatedAt: null }]);
	};

	const update = (itemId: string, changes: Partial<Pick<KanbanItem, "title" | "description" | "noteId" | "priority" | "labels" | "dueDate">>) => {
		const id = vaultId();
		const current = items();
		const normalizedTitle = changes.title?.trim();
		if (!id || loading() || readFailed() || !current.some(item => item.id === itemId)
			|| (changes.title !== undefined && (!normalizedTitle || normalizedTitle.length > 500))
			|| (changes.description !== undefined && (changes.description.length > 5000))
			|| (changes.noteId !== undefined && changes.noteId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(changes.noteId))
			|| (changes.priority !== undefined && !kanbanPriorities.includes(changes.priority))
			|| (changes.labels !== undefined && (changes.labels.length > 8 || changes.labels.some(label => !label.trim() || label.length > 32)
				|| new Set(changes.labels).size !== changes.labels.length))
			|| (changes.dueDate !== undefined && changes.dueDate !== null && !isValidKanbanDueDate(changes.dueDate))) return;
		persist(id, current.map(item => item.id === itemId ? {
			...item,
			...changes,
			...(normalizedTitle === undefined ? {} : { title: normalizedTitle }),
		} : item));
	};

	const rename = (itemId: string, title: string) => {
		const id = vaultId(), normalized = title.trim();
		if (!id || loading() || readFailed() || !normalized || normalized.length > 500) return;
		persist(id, items().map((item) => item.id === itemId ? { ...item, title: normalized } : item));
	};

	const move = (itemId: string, status: KanbanStatus, position: number) => {
		const id = vaultId();
		if (!id || loading() || readFailed() || !kanbanStatuses.includes(status) || !Number.isSafeInteger(position)
			|| position < 0 || position > maxKanbanPosition) return;
		const current = items();
		const item = current.find((entry) => entry.id === itemId);
		if (!item) return;
		const sourceLane = current.filter(entry => entry.status === item.status).sort((left, right) => left.position - right.position);
		const sameLane = item.status === status;
		const destinationBefore = sameLane
			? sourceLane.filter(entry => entry.id !== item.id)
			: current.filter(entry => entry.status === status).sort((left, right) => left.position - right.position);
		if (position > destinationBefore.length) return;

		const destinationAfter = [...destinationBefore];
		destinationAfter.splice(position, 0, item);
		if (sameLane && sourceLane.every((entry, index) => entry.id === destinationAfter[index]?.id && entry.position === index)) return;

		const nextPosition = new Map<string, number>();
		if (!sameLane) sourceLane.filter(entry => entry.id !== item.id).forEach((entry, index) => nextPosition.set(entry.id, index));
		destinationAfter.forEach((entry, index) => nextPosition.set(entry.id, index));
		const updatedAt = sameLane ? item.updatedAt : Date.now();
		persist(id, current.map(entry => entry.id === item.id
			? { ...entry, status, position: position, ...(sameLane ? {} : { updatedAt }) }
			: nextPosition.has(entry.id) ? { ...entry, position: nextPosition.get(entry.id)! } : entry));
	};

	const remove = (itemId: string): { item: KanbanItem; vaultId: string } | undefined => {
		const id = vaultId();
		if (!id || loading() || readFailed()) return undefined;
		const removed = items().find(item => item.id === itemId);
		if (!removed) return undefined;
		persist(id, items().filter((item) => item.id !== itemId));
		return { item: removed, vaultId: id };
	};

	const restore = (deleted: { item: KanbanItem; vaultId: string }): boolean => {
		const id = vaultId();
		const current = items();
		const item = deleted.item;
		if (!id || id !== deleted.vaultId || loading() || readFailed() || current.length >= maxKanbanItems || current.some(entry => entry.id === item.id)) return false;
		const occupied = new Set(current.filter(entry => entry.status === item.status).map(entry => entry.position));
		let position = item.position;
		if (occupied.has(position)) {
			position = Array.from({ length: maxKanbanPosition + 1 }, (_, index) => index).find(index => !occupied.has(index)) ?? -1;
		}
		if (position < 0) return false;
		persist(id, [...current, { ...item, position }]);
		return true;
	};

	const setWipLimit = (status: KanbanStatus, limit: number | undefined) => {
		const id = vaultId();
		if (!id || loading() || readFailed() || !kanbanStatuses.includes(status)) return;
		const next = { ...wipLimits() };
		if (limit === undefined || limit === 0) delete next[status];
		else if (Number.isSafeInteger(limit) && limit >= 1 && limit <= maxKanbanItems) next[status] = limit;
		else return;
		persist(id, items(), next);
	};

	return { open, setOpen, panelWidth, setPanelWidth, panelStage, setPanelStage, activeVaultId: vaultId, items, wipLimits, setWipLimit, loading, error, readFailed, retryRead, add, rename, update, move, remove, restore, flushSave, view };
};
