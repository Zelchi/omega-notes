import { createEffect, createSignal, on } from "solid-js";
import type { Accessor } from "solid-js";
import { readKanban, saveKanban } from "../api/kanban.repository";
import { kanbanStatuses, maxKanbanItems, maxKanbanPosition, type KanbanItem, type KanbanStatus } from "./kanban";

export const useKanban = (vaultId: Accessor<string | undefined>) => {
	const [open, setOpen] = createSignal(false);
	const [items, setItems] = createSignal<KanbanItem[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal(false);
	const [readFailed, setReadFailed] = createSignal(false);
	const [adding, setAdding] = createSignal<KanbanStatus>();
	const [draft, setDraft] = createSignal("");
	const [editing, setEditing] = createSignal<string>();
	const [editDraft, setEditDraft] = createSignal("");
	const [actionsVisibleId, setActionsVisibleId] = createSignal<string>();
	const [collapsedStatuses, setCollapsedStatuses] = createSignal<Set<KanbanStatus>>(new Set());
	const view = { adding, setAdding, draft, setDraft, editing, setEditing, editDraft, setEditDraft, actionsVisibleId, setActionsVisibleId, collapsedStatuses, setCollapsedStatuses };
	let loadRevision = 0;
	let writeRevision = 0;
	const writes = new Map<string, Promise<void>>();

	const load = (id: string, revision: number) => {
		setLoading(true);
		const pendingWrite = writes.get(id);
		void (pendingWrite ? pendingWrite.catch(() => undefined) : Promise.resolve()).then(() => readKanban(id)).then((saved) => {
			if (revision === loadRevision && vaultId() === id) {
				setItems(saved);
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
		setError(false);
		setReadFailed(false);
		setAdding(undefined); setDraft(""); setEditing(undefined); setEditDraft("");
		setActionsVisibleId(undefined); setCollapsedStatuses(new Set<KanbanStatus>());
		if (!id) { setLoading(false); return; }
		load(id, revision);
	}, { defer: false }));

	const persist = (id: string, next: KanbanItem[]) => {
		if (loading() || readFailed()) return;
		const revision = ++writeRevision;
		setItems(next);
		setError(false);
		const previous = writes.get(id) ?? Promise.resolve();
		const pending = previous.catch(() => undefined).then(() => saveKanban(id, next));
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
		persist(id, [...current, { id: crypto.randomUUID(), title: normalized, status, position, createdAt: now, updatedAt: null }]);
	};

	const rename = (itemId: string, title: string) => {
		const id = vaultId(), normalized = title.trim();
		if (!id || loading() || readFailed() || !normalized || normalized.length > 500) return;
		persist(id, items().map((item) => item.id === itemId ? { ...item, title: normalized } : item));
	};

	const move = (itemId: string, status: KanbanStatus, position: number, targetItemId?: string) => {
		const id = vaultId();
		if (!id || loading() || readFailed() || !kanbanStatuses.includes(status) || !Number.isSafeInteger(position)
			|| position < 0 || position > maxKanbanPosition) return;
		const current = items();
		const item = current.find((entry) => entry.id === itemId);
		const target = targetItemId
			? current.find((entry) => entry.id === targetItemId)
			: current.find((entry) => entry.status === status && entry.position === position);
		if (!item || (targetItemId && !target)) return;
		const targetStatus = target?.status ?? status;
		const targetPosition = target?.position ?? position;
		if (item.status === targetStatus && item.position === targetPosition) return;
		const now = item.status === targetStatus ? null : Date.now();
		persist(id, current.map((entry) => entry.id === item.id
			? { ...entry, status: targetStatus, position: targetPosition, ...(now === null ? {} : { updatedAt: now }) }
			: target && entry.id === target.id
				? { ...entry, status: item.status, position: item.position, ...(now === null ? {} : { updatedAt: now }) }
				: entry));
	};

	const remove = (itemId: string) => {
		const id = vaultId();
		if (!id || loading() || readFailed()) return;
		persist(id, items().filter((item) => item.id !== itemId));
	};

	return { open, setOpen, items, loading, error, readFailed, retryRead, add, rename, move, remove, flushSave, view };
};
