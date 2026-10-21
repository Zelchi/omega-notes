export type ArchiveFolder = { id: string; name: string; parentFolderId?: string };
export type ArchiveItem = { kind: "folder" | "note"; id: string };
export type ArchiveState = {
	folders: ArchiveFolder[];
	noteFolders: Record<string, string>;
	itemOrder: Record<string, ArchiveItem[]>;
};

const storageKey = (vaultId: string): string => `omega-notes.archive.${encodeURIComponent(vaultId)}`;
const emptyState = (): ArchiveState => ({ folders: [], noteFolders: {}, itemOrder: {} });

export const readArchiveState = (vaultId: string): ArchiveState => {
	if (!vaultId || typeof window === "undefined") return emptyState();
	try {
		const value: unknown = JSON.parse(localStorage.getItem(storageKey(vaultId)) ?? "null");
		if (!value || typeof value !== "object") return emptyState();
		const stored = value as Partial<ArchiveState> & { noteOrder?: Record<string, string[]> };
		const rawFolders = Array.isArray(stored.folders)
			? stored.folders.filter((folder): folder is ArchiveFolder =>
				typeof folder?.id === "string" && typeof folder.name === "string" && !!folder.name.trim())
			: [];
		const rawFolderIds = new Set(rawFolders.map((folder) => folder.id));
		const folders = rawFolders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentFolderId: typeof folder.parentFolderId === "string" && folder.parentFolderId !== folder.id && rawFolderIds.has(folder.parentFolderId)
				? folder.parentFolderId
				: undefined,
		}));
		const folderIds = new Set(folders.map((folder) => folder.id));
		const folderById = new Map(folders.map((folder) => [folder.id, folder]));
		for (const folder of folders) {
			const visited = new Set([folder.id]);
			let parentId = folder.parentFolderId;
			while (parentId) {
				if (visited.has(parentId)) {
					folder.parentFolderId = undefined;
					break;
				}
				visited.add(parentId);
				parentId = folderById.get(parentId)?.parentFolderId;
			}
		}
		const noteFolders = stored.noteFolders && typeof stored.noteFolders === "object" && !Array.isArray(stored.noteFolders)
			? Object.fromEntries(Object.entries(stored.noteFolders).filter((entry): entry is [string, string] =>
				typeof entry[1] === "string" && folderIds.has(entry[1])))
			: {};
		const storedOrder = stored.itemOrder && typeof stored.itemOrder === "object" && !Array.isArray(stored.itemOrder)
			? Object.fromEntries(Object.entries(stored.itemOrder).filter((entry): entry is [string, ArchiveItem[]] =>
				typeof entry[0] === "string" && Array.isArray(entry[1]) && entry[1].every((item) =>
					!!item && typeof item === "object" && (item.kind === "folder" || item.kind === "note") && typeof item.id === "string")))
			: {};
		const legacyNoteOrder = stored.noteOrder && typeof stored.noteOrder === "object" && !Array.isArray(stored.noteOrder)
			? Object.fromEntries(Object.entries(stored.noteOrder).filter((entry): entry is [string, string[]] =>
				typeof entry[0] === "string" && Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")))
			: {};
		const itemOrder = { ...storedOrder };
		for (const parentFolderId of [undefined, ...folders.map((folder) => folder.id)]) {
			const key = parentFolderId ?? "";
			if (itemOrder[key]) continue;
			itemOrder[key] = [
				...folders.filter((folder) => folder.parentFolderId === parentFolderId).map(({ id }) => ({ kind: "folder" as const, id })),
				...(legacyNoteOrder[key] ?? []).map((id) => ({ kind: "note" as const, id })),
			];
		}
		return { folders, noteFolders, itemOrder };
	} catch {
		return emptyState();
	}
};

export const saveArchiveState = (vaultId: string, state: ArchiveState): void => {
	if (!vaultId || typeof window === "undefined") return;
	try { localStorage.setItem(storageKey(vaultId), JSON.stringify(state)); }
	catch { /* A organização continua disponível até esta visualização ser fechada. */ }
};
