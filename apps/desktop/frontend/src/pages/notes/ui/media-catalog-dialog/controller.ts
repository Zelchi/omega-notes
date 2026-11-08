import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createNoteDisplayTitleIndex } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { noteMediaSource, type NoteMediaCatalogItem, type NoteMediaType, type NoteSummary, type StudyNote } from "@/entities/note";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import type { ImportedMedia } from "../../model/media";
import { readVideoThumbnailSource, selectMediaFiles } from "../../model/media-import";
import { noteImageUrl } from "../../model/note-image-url";

type CatalogMedia = { id: string; source: ImportedMedia; noteTitles: string[] };
type DeletableMedia = { mediaType: NoteMediaType; mediaId: string };
type MediaContextMenu = DeletableMedia & { x: number; y: number };
const PREVIEW_LOAD_CONCURRENCY = 4;

export type MediaCatalogDialogProps = {
	open: boolean;
	vaultId: string;
	currentNote: () => StudyNote;
	notes: () => NoteSummary[];
	loadMediaCatalog: () => Promise<NoteMediaCatalogItem[]>;
	onDeleteMedia: (mediaType: NoteMediaType, mediaId: string) => Promise<void>;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onSelect: (media: ImportedMedia) => void;
	onImportFiles: (files: File[]) => Promise<void>;
	onImportPaths: (paths: string[]) => Promise<void>;
};

const searchKey = (value: string): string => {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
};

const sourceKey = (source: ImportedMedia, elementId: string): string => {
	if (source.type === "image") return `image:${"imageId" in source ? source.imageId : elementId}`;
	if (source.type === "audio") return `audio:${"audioId" in source ? source.audioId : elementId}`;
	return `video:${"videoId" in source ? source.videoId : elementId}`;
};

const deletionTarget = (item: CatalogMedia): DeletableMedia | undefined => {
	const { source } = item;
	if (source.type === "image" && "imageId" in source) {
		return { mediaType: "image", mediaId: source.imageId };
	}
	if (source.type === "audio" && "audioId" in source) {
		return { mediaType: "audio", mediaId: source.audioId };
	}
	if (source.type === "video" && "videoId" in source) {
		return { mediaType: "video", mediaId: source.videoId };
	}
	return undefined;
};

const isSameMedia = (source: ImportedMedia, target: DeletableMedia): boolean => {
	switch (target.mediaType) {
		case "image": return source.type === "image" && "imageId" in source && source.imageId === target.mediaId;
		case "audio": return source.type === "audio" && "audioId" in source && source.audioId === target.mediaId;
		case "video": return source.type === "video" && "videoId" in source && source.videoId === target.mediaId;
	}
};

export const useMediaCatalogDialogController = (props: MediaCatalogDialogProps) => {
	const [query, setQuery] = createSignal("");
	const [catalogEntries, setCatalogEntries] = createSignal<NoteMediaCatalogItem[]>([]);
	const [loadingCatalog, setLoadingCatalog] = createSignal(false);
	const [loadError, setLoadError] = createSignal(false);
	const [sources, setSources] = createSignal<Record<string, string>>({});
	const [contextMenu, setContextMenu] = createSignal<MediaContextMenu>();
	const [confirmationMedia, setConfirmationMedia] = createSignal<DeletableMedia>();
	const [deletingMedia, setDeletingMedia] = createSignal(false);
	const [deleteError, setDeleteError] = createSignal(false);
	let fileInput!: HTMLInputElement;
	let requestId = 0;
	let loadedVaultId = props.vaultId;
	const objectUrls = new Set<string>();
	let catalogRequestId = 0;
	const media = createMemo(() => {
		const catalog = new Map<string, CatalogMedia>();
		const currentNote = props.currentNote();
		const entries = catalogEntries();
		const noteNames = new Map(props.notes().map(({ id, title }) => [id, { id, title }] as const));
		for (const entry of entries) noteNames.set(entry.noteId, { id: entry.noteId, title: entry.noteTitle });
		noteNames.set(currentNote.id, { id: currentNote.id, title: currentNote.title });
		const displayTitles = createNoteDisplayTitleIndex([...noteNames.values()]);
		const addMedia = (noteId: string, noteTitle: string, elementId: string, source: ImportedMedia): void => {
			const id = sourceKey(source, elementId);
			const item = catalog.get(id) ?? { id, source, noteTitles: [] };
			const title = displayTitles.get(noteId) ?? noteTitle;
			if (!item.noteTitles.includes(title)) item.noteTitles.push(title);
			catalog.set(id, item);
		};
		for (const entry of entries) {
			if (entry.noteId !== currentNote.id) addMedia(entry.noteId, entry.noteTitle, entry.elementId, entry.source);
		}
		for (const element of currentNote.document.elements) {
			if (element.type === "text") continue;
			const source = noteMediaSource(element);
			if (source) addMedia(currentNote.id, currentNote.title, element.id, source);
		}
		return [...catalog.values()];
	});
	const filtered = createMemo(() => {
		const term = searchKey(query());
		return media().filter((item) => !term || item.noteTitles.some((title) => searchKey(title).includes(term)));
	});

	const clearSources = (): void => {
		requestId += 1;
		objectUrls.forEach(URL.revokeObjectURL);
		objectUrls.clear();
		setSources({});
	};

	const loadCatalog = (notes: NoteSummary[]) => {
		const requestId = ++catalogRequestId;
		setCatalogEntries([]);
		setLoadError(false);
		setLoadingCatalog(true);
		const isCurrent = () => requestId === catalogRequestId && props.open && props.notes() === notes;
		void props.loadMediaCatalog().then((entries) => {
			if (isCurrent()) setCatalogEntries(entries);
		}).catch((error) => {
			if (!isCurrent()) return;
			console.error("Could not load media catalog", error);
			setLoadError(true);
		}).finally(() => {
			if (isCurrent()) setLoadingCatalog(false);
		});
		return requestId;
	};

	createEffect(() => {
		if (!props.open) {
			setContextMenu(undefined);
			setConfirmationMedia(undefined);
			setDeleteError(false);
			catalogRequestId += 1;
			setCatalogEntries([]);
			setLoadError(false);
			setLoadingCatalog(false);
			return;
		}
		const notes = props.notes();
		const requestId = loadCatalog(notes);
		onCleanup(() => {
			if (catalogRequestId === requestId) catalogRequestId += 1;
		});
	});

	createEffect(() => {
		const open = props.open;
		const catalog = media();
		const desktop = isDesktopRuntime();
		const vaultId = props.vaultId;
		if (vaultId !== loadedVaultId) {
			loadedVaultId = vaultId;
			clearSources();
		}
		if (!open || !catalog.length) {
			clearSources();
			return;
		}

		const currentRequest = ++requestId;
		let active = true;
		const abortController = new AbortController();
		const previewEntries = catalog.filter((item) =>
			(item.source.type === "image" && desktop && "imageId" in item.source)
			|| (item.source.type === "video" && ("dataUrl" in item.source || (desktop && "videoId" in item.source))),
		);
		const previewIds = new Set(previewEntries.map((item) => item.id));
		const cached = untrack(sources);
		const retained: Record<string, string> = {};
		for (const [id, source] of Object.entries(cached)) {
			if (previewIds.has(id)) retained[id] = source;
			else if (objectUrls.has(source)) {
				URL.revokeObjectURL(source);
				objectUrls.delete(source);
			}
		}
		setSources(retained);
		const pending = previewEntries.filter((item) => !retained[item.id]);
		let nextPreview = 0;
		const isCurrent = (): boolean => active && currentRequest === requestId;
		const loadPreviews = async (): Promise<void> => {
			while (isCurrent()) {
				const item = pending[nextPreview++];
				if (!item) return;
				try {
					const source = item.source.type === "image" && "imageId" in item.source
						? noteImageUrl(vaultId, item.source.imageId)
						: item.source.type === "video"
							? await readVideoThumbnailSource(item.source, abortController.signal)
							: undefined;
					if (!source) continue;
					if (!isCurrent()) {
						if (item.source.type === "video") URL.revokeObjectURL(source);
						return;
					}
					if (item.source.type === "video") objectUrls.add(source);
					setSources((current) => ({ ...current, [item.id]: source }));
				} catch (error) {
					if (isCurrent()) console.error(error);
				}
			}
		};
		onCleanup(() => {
			active = false;
			abortController.abort();
		});
		for (let worker = 0; worker < Math.min(PREVIEW_LOAD_CONCURRENCY, pending.length); worker++) {
			void loadPreviews();
		}
	});

	onCleanup(clearSources);

	const close = (): void => {
		setContextMenu(undefined);
		props.onClose();
	};
	const retryLoad = (): void => { loadCatalog(props.notes()); };

	const selectMedia = (item: CatalogMedia): void => {
		setContextMenu(undefined);
		props.onSelect(item.source);
		close();
	};

	const openContextMenu = (item: CatalogMedia, event: MouseEvent, bounds?: DOMRect): void => {
		const target = deletionTarget(item);
		if (!isDesktopRuntime() || !target || !bounds) return;
		event.preventDefault();
		event.stopPropagation();
		setDeleteError(false);
		setContextMenu({
			...target,
			x: Math.min(Math.max(8, event.clientX - bounds.left), Math.max(8, bounds.width - 194)),
			y: Math.min(Math.max(8, event.clientY - bounds.top), Math.max(8, bounds.height - 52)),
		});
	};

	const requestMediaDeletion = (target: DeletableMedia): void => {
		setContextMenu(undefined);
		if (!isDesktopRuntime() || deletingMedia()) return;
		setDeleteError(false);
		setConfirmationMedia(target);
	};

	const cancelMediaDeletion = (): void => {
		if (deletingMedia()) return;
		setConfirmationMedia(undefined);
		setDeleteError(false);
	};

	const confirmMediaDeletion = async (): Promise<void> => {
		const target = confirmationMedia();
		if (!target || !props.open || !isDesktopRuntime() || deletingMedia()) return;

		setDeletingMedia(true);
		setDeleteError(false);
		try {
			await props.onDeleteMedia(target.mediaType, target.mediaId);
			setCatalogEntries((entries) => entries.filter((entry) => !isSameMedia(entry.source, target)));
			setConfirmationMedia(undefined);
		} catch (error) {
			console.error("Could not delete media from all vaults", error);
			setDeleteError(true);
		} finally {
			setDeletingMedia(false);
		}
	};

	const importFiles = (event: Event & { currentTarget: HTMLInputElement }): void => {
		const files = [...(event.currentTarget.files ?? [])];
		event.currentTarget.value = "";
		void props.onImportFiles(files).then(close).catch(console.error);
	};

	const openFilePicker = (): void => {
		if (!isDesktopRuntime()) {
			fileInput.click();
			return;
		}
		void selectMediaFiles(props.t("importMedia"))
			.then(async (paths) => {
				if (!paths.length) return;
				await props.onImportPaths(paths);
				close();
			})
			.catch(console.error);
	};

	return {
		query,
		setQuery,
		sources,
		filtered,
		loadingCatalog,
		loadError,
		contextMenu,
		confirmationMedia,
		deletingMedia,
		deleteError,
		retryLoad,
		close,
		closeContextMenu: () => setContextMenu(undefined),
		openContextMenu,
		requestMediaDeletion,
		cancelMediaDeletion,
		confirmMediaDeletion,
		selectMedia,
		importFiles,
		openFilePicker,
		setFileInput: (element: HTMLInputElement) => (fileInput = element),
	};
};

export type MediaCatalogController = ReturnType<typeof useMediaCatalogDialogController>;
export type MediaCatalogViewProps = {
	open: boolean;
	exiting: boolean;
	t: (key: TranslationKey) => string;
	catalog: MediaCatalogController;
};
