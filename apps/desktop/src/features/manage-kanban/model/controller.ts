import { createEffect, createSignal, on } from "solid-js";
import type { Accessor } from "solid-js";
import { readKanban, saveKanban } from "../api/kanban.repository";
import { kanbanStatuses, maxKanbanPosition, type KanbanItem, type KanbanStatus } from "./kanban";

export const useKanban = (vaultId: Accessor<string | undefined>) => {
	const [open, setOpen] = createSignal(false);
	const [items, setItems] = createSignal<KanbanItem[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal(false);
	const [adding, setAdding] = createSignal<KanbanStatus>();
	const [draft, setDraft] = createSignal("");
	const [editing, setEditing] = createSignal<string>();
	const [editDraft, setEditDraft] = createSignal("");
	const [actionsVisibleId, setActionsVisibleId] = createSignal<string>();
	const [collapsedStatuses, setCollapsedStatuses] = createSignal<Set<KanbanStatus>>(new Set(kanbanStatuses));
	const view = { adding, setAdding, draft, setDraft, editing, setEditing, editDraft, setEditDraft, actionsVisibleId, setActionsVisibleId, collapsedStatuses, setCollapsedStatuses };
	let loadRevision = 0;
	let writeRevision = 0;
	const writes = new Map<string, Promise<void>>();

	createEffect(on(vaultId, (id) => {
		const revision = ++loadRevision;
		setOpen(false);
		setItems([]);
		setError(false);
		setAdding(undefined); setDraft(""); setEditing(undefined); setEditDraft("");
		setActionsVisibleId(undefined); setCollapsedStatuses(new Set(kanbanStatuses));
		if (!id) { setLoading(false); return; }
		setLoading(true);
		const pendingWrite = writes.get(id);
		void (pendingWrite ? pendingWrite.catch(() => undefined) : Promise.resolve()).then(() => readKanban(id)).then((saved) => {
			if (revision === loadRevision && vaultId() === id) setItems(saved);
		}).catch(() => {
			if (revision === loadRevision && vaultId() === id) setError(true);
		}).finally(() => {
			if (revision === loadRevision) setLoading(false);
		});
	}, { defer: false }));

	const persist = (id: string, next: KanbanItem[]) => {
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

	const add = (title: string, status: KanbanStatus) => {
		const id = vaultId();
		const normalized = title.trim();
		if (!id || !normalized || normalized.length > 500 || !kanbanStatuses.includes(status)) return;
		const now = Date.now();
		const current = items();
		const occupied = new Set(current.filter((item) => item.status === status).map((item) => item.position));
		let position = Math.max(-1, ...occupied) + 1;
		if (position > maxKanbanPosition) {
			position = 0;
			while (occupied.has(position) && position <= maxKanbanPosition) position += 1;
		}
		if (position > maxKanbanPosition) return;
		persist(id, [...current, { id: crypto.randomUUID(), title: normalized, status, position, createdAt: now, updatedAt: now }]);
	};

	const rename = (itemId: string, title: string) => {
		const id = vaultId(), normalized = title.trim();
		if (!id || !normalized || normalized.length > 500) return;
		persist(id, items().map((item) => item.id === itemId ? { ...item, title: normalized } : item));
	};

	const move = (itemId: string, status: KanbanStatus, position: number) => {
		const id = vaultId();
		if (!id || !kanbanStatuses.includes(status) || !Number.isSafeInteger(position)
			|| position < 0 || position > maxKanbanPosition) return;
		const current = items();
		const item = current.find((entry) => entry.id === itemId);
		if (!item || (item.status === status && item.position === position)) return;
		const target = current.find((entry) => entry.status === status && entry.position === position);
		if (item.status === status) {
			persist(id, current.map((entry) => entry.id === item.id
				? { ...entry, position }
				: target && entry.id === target.id ? { ...entry, position: item.position } : entry));
			return;
		}
		const now = Date.now();
		persist(id, current.map((entry) => entry.id === item.id
			? { ...entry, status, position, updatedAt: now }
			: target && entry.id === target.id
				? { ...entry, status: item.status, position: item.position, updatedAt: now }
				: entry));
	};

	const remove = (itemId: string) => {
		const id = vaultId();
		if (!id) return;
		persist(id, items().filter((item) => item.id !== itemId));
	};

	return { open, setOpen, items, loading, error, add, rename, move, remove, view };
};
