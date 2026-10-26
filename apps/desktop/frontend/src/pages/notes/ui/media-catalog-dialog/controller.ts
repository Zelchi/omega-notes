import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createNoteDisplayTitleIndex } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { noteMediaSource, type NoteMediaCatalogItem, type NoteSummary, type StudyNote } from "@/entities/note";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import { confirm } from "@/shared/lib/desktop";
import type { ImportedMedia } from "../../model/media";
import { readImageSource, readVideoThumbnailSource, selectMediaFiles } from "../../model/media-import";
import { cleanupOrphanedMedia } from "../../api/media.repository";

type CatalogMedia = { id: string; source: ImportedMedia; noteTitles: string[] };
const PREVIEW_LOAD_CONCURRENCY = 4;

export type MediaCatalogDialogProps = {
	open: boolean;
	currentNote: () => StudyNote;
	notes: () => NoteSummary[];
	loadMediaCatalog: () => Promise<NoteMediaCatalogItem[]>;
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

export const useMediaCatalogDialogController = (props: MediaCatalogDialogProps) => {
	const [query, setQuery] = createSignal("");
	const [catalogEntries, setCatalogEntries] = createSignal<NoteMediaCatalogItem[]>([]);
	const [loadingCatalog, setLoadingCatalog] = createSignal(false);
	const [loadError, setLoadError] = createSignal(false);
	const [sources, setSources] = createSignal<Record<string, string>>({});
	const [cleaning, setCleaning] = createSignal(false);
	const [cleanupStatus, setCleanupStatus] = createSignal<{ message: string; failed: boolean }>();
	let fileInput!: HTMLInputElement;
	let requestId = 0;
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
			else {
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
						? await readImageSource(item.source.imageId)
						: item.source.type === "video"
							? await readVideoThumbnailSource(item.source, abortController.signal)
							: undefined;
					if (!source) continue;
					if (!isCurrent()) {
						URL.revokeObjectURL(source);
						return;
					}
					objectUrls.add(source);
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
		props.onClose();
	};
	const retryLoad = (): void => { loadCatalog(props.notes()); };

	const selectMedia = (item: CatalogMedia): void => {
		props.onSelect(item.source);
		close();
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

	const cleanOrphanedMedia = async (): Promise<void> => {
		if (cleaning()) return;
		setCleaning(true);
		setCleanupStatus(undefined);
		try {
			const accepted = await confirm(props.t("cleanupMediaConfirmation"), {
				title: props.t("cleanupMedia"),
				kind: "warning",
				okLabel: props.t("cleanupMediaConfirm"),
				cancelLabel: props.t("cancel"),
			});
			if (!accepted) return;
			const result = await cleanupOrphanedMedia();
			const message = props.t("cleanupMediaDone")
				.replace("{images}", String(result.images))
				.replace("{audio}", String(result.audio))
				.replace("{video}", String(result.video));
			setCleanupStatus({ message, failed: false });
		} catch (error) {
			console.error(error);
			setCleanupStatus({ message: props.t("cleanupMediaFailed"), failed: true });
		} finally {
			setCleaning(false);
		}
	};

	return {
		query,
		setQuery,
		sources,
		filtered,
		loadingCatalog,
		loadError,
		retryLoad,
		close,
		selectMedia,
		importFiles,
		openFilePicker,
		cleanOrphanedMedia,
		cleaning,
		cleanupStatus,
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
