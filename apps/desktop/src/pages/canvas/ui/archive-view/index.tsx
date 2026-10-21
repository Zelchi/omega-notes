import type { NoteSummary, StudyNote } from "@/entities/note";
import { displayNoteTitle } from "@/entities/note";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import Input from "@/shared/ui/input";
import { cx } from "@/shared/lib/classes";
import { createEffect, createSignal, For, onCleanup, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { readArchiveState, saveArchiveState, type ArchiveFolder, type ArchiveItem, type ArchiveState } from "./archive.repository";
import { styles } from "./style.css.ts";
import { styles as menuStyles } from "../graph-canvas/style.css.ts";

type Props = {
	vaultId: string;
	notes: NoteSummary[];
	mode: "edit" | "view";
	onCreateNote: () => Promise<StudyNote | undefined>;
	onOpenNote: (note: NoteSummary) => void;
	onRequestRename: (note: NoteSummary) => void;
	onDeleteNote: (note: NoteSummary) => Promise<void>;
	t: (key: TranslationKey) => string;
};

type FolderEditor =
	| { kind: "create"; parentFolderId?: string; parentPath: string[] }
	| { kind: "rename"; folderId: string };
type ArchiveEntry = { kind: "folder"; folder: ArchiveFolder } | { kind: "note"; note: NoteSummary };

const sameItem = (left: ArchiveItem, right: ArchiveItem): boolean => left.kind === right.kind && left.id === right.id;
const itemKey = (item: ArchiveItem): string => `${item.kind}:${item.id}`;
const parentKey = (folderId?: string): string => folderId ?? "";

const ArchiveView: Component<Props> = (props) => {
	let root!: HTMLElement;
	const [state, setState] = createSignal(readArchiveState(props.vaultId));
	const [path, setPath] = createSignal<string[]>([]);
	const [folderEditor, setFolderEditor] = createSignal<FolderEditor>();
	const [folderName, setFolderName] = createSignal("");
	const [folderError, setFolderError] = createSignal("");
	const [confirmDeleteId, setConfirmDeleteId] = createSignal<string>();
	const [dropTargetId, setDropTargetId] = createSignal<string>();
	const [draggedItem, setDraggedItem] = createSignal<ArchiveItem>();
	const [contextMenu, setContextMenu] = createSignal<{ item: ArchiveItem; x: number; y: number }>();

	createEffect(() => saveArchiveState(props.vaultId, state()));
	createEffect(() => {
		if (!contextMenu()) return;
		const outside = (event: PointerEvent) => {
			if (!(event.target instanceof Element) || !event.target.closest(".graph-context-menu")) setContextMenu(undefined);
		};
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(undefined); };
		window.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", escape);
		onCleanup(() => {
			window.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", escape);
		});
	});
	const openEntryContextMenu = (event: MouseEvent, item: ArchiveItem): void => {
		event.preventDefault();
		event.stopPropagation();
		if (props.mode !== "edit") return;
		const rect = root.getBoundingClientRect();
		setContextMenu({ item, x: Math.max(8, Math.min(rect.width - 160, event.clientX - rect.left)), y: Math.max(8, Math.min(rect.height - 90, event.clientY - rect.top)) });
	};

	const folderById = (folderId: string, current: ArchiveState = state()): ArchiveFolder | undefined =>
		current.folders.find((folder) => folder.id === folderId);
	const columnPath = (): string[] => {
		const valid: string[] = [];
		let parentFolderId: string | undefined;
		for (const folderId of path()) {
			const folder = folderById(folderId);
			if (!folder || folder.parentFolderId !== parentFolderId) break;
			valid.push(folderId);
			parentFolderId = folderId;
		}
		return valid;
	};
	const columnParents = (): Array<string | undefined> => [undefined, ...columnPath()];
	const currentFolderId = (): string | undefined => {
		const currentPath = columnPath();
		return currentPath[currentPath.length - 1];
	};
	const folderForNote = (noteId: string, current: ArchiveState = state()): string | undefined => {
		const folderId = current.noteFolders[noteId];
		return current.folders.some((folder) => folder.id === folderId) ? folderId : undefined;
	};
	const getEntries = (parentFolderId?: string, current: ArchiveState = state()): ArchiveEntry[] => {
		const entries: ArchiveEntry[] = [
			...current.folders.filter((folder) => folder.parentFolderId === parentFolderId).map((folder) => ({ kind: "folder" as const, folder })),
			...props.notes.filter((note) => folderForNote(note.id, current) === parentFolderId).map((note) => ({ kind: "note" as const, note })),
		];
		const order = current.itemOrder[parentKey(parentFolderId)] ?? [];
		const orderIndex = new Map(order.map((item, index) => [itemKey(item), index]));
		return entries.sort((left, right) => {
			const leftOrder = orderIndex.get(itemKey(entryItem(left))) ?? Number.MAX_SAFE_INTEGER;
			const rightOrder = orderIndex.get(itemKey(entryItem(right))) ?? Number.MAX_SAFE_INTEGER;
			if (leftOrder !== rightOrder) return leftOrder - rightOrder;
			return left.kind === right.kind ? 0 : left.kind === "folder" ? -1 : 1;
		});
	};
	const entryItem = (entry: ArchiveEntry): ArchiveItem => entry.kind === "folder"
		? { kind: "folder", id: entry.folder.id }
		: { kind: "note", id: entry.note.id };
	const parentOfItem = (item: ArchiveItem, current: ArchiveState = state()): string | undefined => item.kind === "folder"
		? folderById(item.id, current)?.parentFolderId
		: folderForNote(item.id, current);
	const isWithinFolder = (folderId: string, possibleAncestorId: string, current: ArchiveState): boolean => {
		const visited = new Set<string>();
		let id: string | undefined = folderId;
		while (id && !visited.has(id)) {
			if (id === possibleAncestorId) return true;
			visited.add(id);
			id = folderById(id, current)?.parentFolderId;
		}
		return false;
	};
	const putItemIn = (item: ArchiveItem, targetFolderId: string | undefined, targetItem?: ArchiveItem): void => {
		if (props.mode !== "edit") return;
		setState((current) => {
			if (item.kind === "folder" && targetFolderId && isWithinFolder(targetFolderId, item.id, current)) return current;
			if (targetItem && parentOfItem(item, current) === targetFolderId) {
				const order = getEntries(targetFolderId, current).map(entryItem);
				const sourceIndex = order.findIndex((existing) => sameItem(existing, item));
				const targetIndex = order.findIndex((existing) => sameItem(existing, targetItem));
				if (sourceIndex < 0 || targetIndex < 0) return current;
				[order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
				return { ...current, itemOrder: { ...current.itemOrder, [parentKey(targetFolderId)]: order } };
			}
			const next: ArchiveState = item.kind === "folder"
				? { ...current, folders: current.folders.map((folder) => folder.id === item.id ? { ...folder, parentFolderId: targetFolderId } : folder) }
				: (() => {
					const noteFolders = { ...current.noteFolders };
					if (targetFolderId) noteFolders[item.id] = targetFolderId;
					else delete noteFolders[item.id];
					return { ...current, noteFolders };
				})();
			const order = getEntries(targetFolderId, current).map(entryItem).filter((existing) => !sameItem(existing, item));
			const targetIndex = targetItem ? order.findIndex((existing) => sameItem(existing, targetItem)) : -1;
			order.splice(targetIndex < 0 ? order.length : targetIndex, 0, item);
			const itemOrder: Record<string, ArchiveItem[]> = {};
			for (const [key, items] of Object.entries(current.itemOrder)) itemOrder[key] = items.filter((existing) => !sameItem(existing, item));
			itemOrder[parentKey(targetFolderId)] = order;
			return { ...next, itemOrder };
		});
	};

	const startCreateFolder = (): void => {
		if (props.mode !== "edit") return;
		setFolderName("");
		setFolderError("");
		setFolderEditor({ kind: "create", parentFolderId: currentFolderId(), parentPath: [...path()] });
	};
	const startRenameFolder = (folder: ArchiveFolder): void => {
		if (props.mode !== "edit") return;
		setFolderName(folder.name);
		setFolderError("");
		setFolderEditor({ kind: "rename", folderId: folder.id });
	};
	const saveFolder = (event: SubmitEvent): void => {
		event.preventDefault();
		const editor = folderEditor();
		const name = folderName().trim();
		if (!editor || props.mode !== "edit" || !name) return;
		const parentFolderId = editor.kind === "create" ? editor.parentFolderId : folderById(editor.folderId)?.parentFolderId;
		const duplicate = state().folders.some((folder) => folder.parentFolderId === parentFolderId &&
			folder.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (editor.kind === "create" || folder.id !== editor.folderId));
		if (duplicate) { setFolderError(props.t("archiveFolderExists")); return; }
		if (editor.kind === "create") {
			const folder = { id: crypto.randomUUID(), name, parentFolderId };
			setState((current) => ({
				...current,
				folders: [...current.folders, folder],
				itemOrder: { ...current.itemOrder, [parentKey(parentFolderId)]: [...getEntries(parentFolderId, current).map(entryItem), { kind: "folder", id: folder.id }] },
			}));
			setPath([...editor.parentPath, folder.id]);
		} else {
			setState((current) => ({ ...current, folders: current.folders.map((folder) => folder.id === editor.folderId ? { ...folder, name } : folder) }));
		}
		setFolderEditor(undefined);
		setFolderName("");
		setFolderError("");
	};
	const deleteFolder = (folderId: string): void => {
		setState((current) => {
			const folder = folderById(folderId, current);
			if (!folder) return current;
			const promotedItems = getEntries(folderId, current).map(entryItem);
			const parentItems = getEntries(folder.parentFolderId, current).map(entryItem);
			const folderIndex = parentItems.findIndex((item) => item.kind === "folder" && item.id === folderId);
			parentItems.splice(folderIndex < 0 ? parentItems.length : folderIndex, 1, ...promotedItems);
			const noteFolders = { ...current.noteFolders };
			for (const item of promotedItems) {
				if (item.kind === "note") {
					if (folder.parentFolderId) noteFolders[item.id] = folder.parentFolderId;
					else delete noteFolders[item.id];
				}
			}
			const itemOrder = { ...current.itemOrder, [parentKey(folder.parentFolderId)]: parentItems };
			delete itemOrder[folderId];
			return {
				folders: current.folders.filter((entry) => entry.id !== folderId).map((entry) =>
					entry.parentFolderId === folderId ? { ...entry, parentFolderId: folder.parentFolderId } : entry),
				noteFolders,
				itemOrder,
			};
		});
		setPath((current) => {
			const index = current.indexOf(folderId);
			return index < 0 ? current : current.slice(0, index);
		});
		setConfirmDeleteId(undefined);
		setFolderEditor(undefined);
	};
	const createNote = async (): Promise<void> => {
		if (props.mode !== "edit") return;
		const targetFolderId = currentFolderId();
		const note = await props.onCreateNote();
		if (!note) return;
		setState((current) => {
			const noteFolders = { ...current.noteFolders };
			if (targetFolderId) noteFolders[note.id] = targetFolderId;
			else delete noteFolders[note.id];
			const item = { kind: "note" as const, id: note.id };
			const itemOrder: Record<string, ArchiveItem[]> = {};
			for (const [key, items] of Object.entries(current.itemOrder)) itemOrder[key] = items.filter((existing) => !sameItem(existing, item));
			itemOrder[parentKey(targetFolderId)] = [...getEntries(targetFolderId, current).map(entryItem).filter((existing) => !sameItem(existing, item)), item];
			return { ...current, noteFolders, itemOrder };
		});
	};
	const openFolder = (folderId: string, depth: number): void => {
		setPath((current) => [...current.slice(0, depth), folderId]);
		setFolderEditor(undefined);
		setConfirmDeleteId(undefined);
	};
	const readDraggedItem = (event: DragEvent): ArchiveItem | undefined => {
		let item = draggedItem();
		try {
			const value: unknown = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "null");
			if (value && typeof value === "object" && "kind" in value && "id" in value &&
				(value.kind === "note" || value.kind === "folder") && typeof value.id === "string") item = value as ArchiveItem;
			} catch { /* Usa a origem local quando o navegador oculta os dados do arraste. */ }
		if (!item) return;
		if (item.kind === "note" && props.notes.some((note) => note.id === item.id)) return item;
		if (item.kind === "folder" && state().folders.some((folder) => folder.id === item.id)) return item;
	};
	const startDragging = (event: DragEvent, item: ArchiveItem): void => {
		if (props.mode !== "edit" || !event.dataTransfer) { event.preventDefault(); return; }
		event.dataTransfer.setData("text/plain", JSON.stringify(item));
		event.dataTransfer.effectAllowed = "move";
		setDraggedItem(item);
	};
	const endDragging = (): void => {
		setDraggedItem(undefined);
		setDropTargetId(undefined);
	};
	const allowDrop = (event: DragEvent, targetId: string): void => {
		if (props.mode !== "edit") return;
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		setDropTargetId(targetId);
	};
	const dropOnEntry = (event: DragEvent, entry: ArchiveEntry, parentFolderId?: string): void => {
		event.preventDefault();
		event.stopPropagation();
		const item = readDraggedItem(event);
		const targetItem = entryItem(entry);
		if (!item || sameItem(item, targetItem)) return;
		const sourceParentId = parentOfItem(item);
		if (entry.kind === "folder" && item.kind === "note") putItemIn(item, entry.folder.id);
		else if (entry.kind === "folder" && item.kind === "folder" && sourceParentId !== parentFolderId) putItemIn(item, entry.folder.id);
		else putItemIn(item, parentFolderId, targetItem);
		setDropTargetId(undefined);
	};
	const dropClass = (targetId: string): string | undefined => dropTargetId() === targetId ? styles.dropTarget : undefined;
	const dropOnGrid = (event: DragEvent, parentFolderId?: string): void => {
		event.preventDefault();
		event.stopPropagation();
		const item = readDraggedItem(event);
		if (item) putItemIn(item, parentFolderId);
		setDropTargetId(undefined);
	};

	return (
		<section class={styles.root} ref={root} aria-label={props.t("archiveHeading")} onContextMenu={(event) => event.preventDefault()}>
			<div class={styles.content}>
				<header class={styles.header}>
					<h2 class={styles.title}>{props.t("archiveHeading")}</h2>
					<div class={styles.headerActions}>
						<Show when={props.mode === "edit"}>
							<Button class={styles.actionButton} type="button" onClick={() => void createNote()}>
								<Icon name="add" size={16} />{props.t("archiveNewNote")}
							</Button>
							<Button class={styles.actionButton} type="button" onClick={startCreateFolder}>
								<Icon name="add" size={16} />{props.t("archiveAddFolder")}
							</Button>
						</Show>
					</div>
				</header>

				<Show when={folderEditor()}>
					<form class={styles.folderForm} onSubmit={saveFolder}>
						<label class={styles.srOnly} for="archive-folder-name">{props.t("archiveFolderName")}</label>
						<Input id="archive-folder-name" class={styles.folderInput} value={folderName()} maxLength={64}
							placeholder={props.t("archiveFolderName")} onInput={(event) => setFolderName(event.currentTarget.value)} />
						<Button class={styles.actionButton} type="submit" disabled={!folderName().trim()}>
							{folderEditor()?.kind === "create" ? props.t("archiveCreateFolder") : props.t("archiveRenameFolder")}
						</Button>
						<Button class={styles.actionButton} type="button" onClick={() => { setFolderEditor(undefined); setFolderError(""); }}>
							{props.t("archiveCancel")}
						</Button>
						<Show when={folderError()}><span class={styles.formError} role="alert">{folderError()}</span></Show>
					</form>
				</Show>

				<Show when={confirmDeleteId()}>
					<div class={styles.confirmDelete} role="alert">
						<span>{props.t("archiveDeleteFolderMessage")}</span>
						<Button class={styles.dangerButton} type="button" onClick={() => deleteFolder(confirmDeleteId()!)}>{props.t("archiveConfirmDeleteFolder")}</Button>
						<Button class={styles.actionButton} type="button" onClick={() => setConfirmDeleteId(undefined)}>{props.t("archiveCancel")}</Button>
					</div>
				</Show>

				<div class={styles.columns}>
					<For each={columnParents()}>{(parentFolderId, depth) => {
						const parentFolder = () => parentFolderId ? folderById(parentFolderId) : undefined;
						const columnId = `archive-column-${depth()}`;
						const gridId = `grid:${parentKey(parentFolderId)}`;
						return <section class={styles.column} id={columnId} aria-label={parentFolder()?.name ?? props.t("archiveRoot")}>
							<h3 class={styles.columnTitle}>{parentFolder()?.name ?? props.t("archiveRoot")}</h3>
							<div class={cx(styles.list, dropTargetId() === gridId && styles.dropGrid)}
								onDragOver={(event) => allowDrop(event, gridId)}
								onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(undefined); }}
								onDrop={(event) => dropOnGrid(event, parentFolderId)}>
								<For each={getEntries(parentFolderId)}>{(entry) => {
									const item = entryItem(entry);
									const folder = entry.kind === "folder" ? entry.folder : undefined;
									const selected = () => folder !== undefined && columnPath()[depth()] === folder.id;
									return (
										<article class={cx(styles.entry, selected() && styles.selectedEntry, dropClass(itemKey(item)), draggedItem() && sameItem(draggedItem()!, item) && styles.dragging)}>
											<Button class={cx(styles.entryButton, props.mode === "edit" && styles.draggableEntry)} type="button"
												draggable={props.mode === "edit"}
												aria-expanded={folder ? selected() : undefined}
													aria-controls={selected() ? `archive-column-${depth() + 1}` : undefined}
												onDragStart={(event) => startDragging(event, item)} onDragEnd={endDragging}
												onDragOver={(event) => allowDrop(event, itemKey(item))}
												onDragLeave={() => setDropTargetId(undefined)} onDrop={(event) => dropOnEntry(event, entry, parentFolderId)}
												onContextMenu={(event) => openEntryContextMenu(event, item)}
												onClick={() => entry.kind === "folder" ? openFolder(entry.folder.id, depth()) : props.onOpenNote(entry.note)}>
												<span class={styles.entryContent}>
													<span class={styles.entryIcon}><Icon name={folder ? "folder" : "file"} size={15} /></span>
													<span class={styles.entryTitle}>{entry.kind === "folder" ? entry.folder.name : displayNoteTitle(entry.note)}</span>
												</span>
											</Button>
											<Show when={props.mode === "edit" ? folder : undefined} keyed>{(folderItem) => (
												<div class={styles.entryActions}>
													<Button class={styles.iconButton} type="button" aria-label={`${props.t("archiveRenameFolder")}: ${folderItem.name}`} onClick={() => startRenameFolder(folderItem)}>
														<Icon name="edit" size={14} />
													</Button>
													<Button class={styles.iconButton} type="button" aria-label={`${props.t("archiveDeleteFolder")}: ${folderItem.name}`} onClick={() => setConfirmDeleteId(folderItem.id)}>
														<Icon name="delete" size={14} />
													</Button>
												</div>
											)}</Show>
										</article>
									);
								}}</For>
							</div>
						</section>;
					}}</For>
				</div>
			</div>
			<Show when={contextMenu()}>
				{(menu) => {
					const rename = () => {
						const item = menu().item;
						setContextMenu(undefined);
						if (item.kind === "note") {
						const note = props.notes.find((entry) => entry.id === item.id);
						if (note) props.onRequestRename(note);
					} else {
						const folder = folderById(item.id);
						if (folder) startRenameFolder(folder);
					}
				};
					const remove = () => {
						const item = menu().item;
						setContextMenu(undefined);
						if (item.kind === "note") {
							const note = props.notes.find((entry) => entry.id === item.id);
						if (note) void props.onDeleteNote(note);
						} else if (folderById(item.id)) setConfirmDeleteId(item.id);
					};
					return <div class={cx(menuStyles.contextMenu, "graph-context-menu")} style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
						onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
						<Button type="button" class={menuStyles.menuButton} onClick={rename}><Icon name="edit" size={15} />{props.t("rename")}</Button>
						<Button type="button" class={cx(menuStyles.menuButton, menuStyles.dangerButton)} onClick={remove}><Icon name="delete" size={15} />{props.t("delete")}</Button>
					</div>;
				}}
			</Show>
		</section>
	);
};

export default ArchiveView;
