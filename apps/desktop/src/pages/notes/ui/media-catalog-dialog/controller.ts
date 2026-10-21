import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { NotePositionedElement, StudyNote } from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { ImportedMedia } from "../../model/media";
import { readImageSource, selectMediaFiles } from "../../model/media-import";
import { cleanupOrphanedMedia } from "../../api/media.repository";

type CatalogMedia = { id: string; source: ImportedMedia; noteTitles: string[] };
const IMAGE_LOAD_CONCURRENCY = 4;

export type MediaCatalogDialogProps = {
	open: boolean;
	loadNotes: () => Promise<StudyNote[]>;
	releaseLoadedNotes: () => void;
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

const catalogSource = (element: NotePositionedElement): ImportedMedia | undefined => {
	if (element.type === "image") {
		if (element.imageId) return { type: "image", imageId: element.imageId };
		if (element.dataUrl) return { type: "image", dataUrl: element.dataUrl };
		return undefined;
	}
	if (element.type === "audio") {
		if (element.audioId) return { type: "audio", audioId: element.audioId, extension: element.extension };
		if (element.dataUrl) return { type: "audio", dataUrl: element.dataUrl, extension: element.extension };
		return undefined;
	}
	if (element.videoId) return { type: "video", videoId: element.videoId, extension: element.extension };
	if (element.dataUrl) return { type: "video", dataUrl: element.dataUrl, extension: element.extension };
	return undefined;
};

const sourceKey = (source: ImportedMedia, elementId: string): string => {
	if (source.type === "image") return `image:${"imageId" in source ? source.imageId : elementId}`;
	if (source.type === "audio") return `audio:${"audioId" in source ? source.audioId : elementId}`;
	return `video:${"videoId" in source ? source.videoId : elementId}`;
};

export const useMediaCatalogDialogController = (props: MediaCatalogDialogProps) => {
	const [query, setQuery] = createSignal("");
	const [notes, setNotes] = createSignal<StudyNote[]>([]);
	const [loadingNotes, setLoadingNotes] = createSignal(false);
	const [sources, setSources] = createSignal<Record<string, string>>({});
	const [cleaning, setCleaning] = createSignal(false);
	const [cleanupStatus, setCleanupStatus] = createSignal<{ message: string; failed: boolean }>();
	let fileInput!: HTMLInputElement;
	let requestId = 0;
	const objectUrls = new Set<string>();
	const media = createMemo(() => {
		const catalog = new Map<string, CatalogMedia>();
		for (const note of notes()) {
			for (const element of note.document.elements) {
				if (element.type === "text") continue;
				const source = catalogSource(element);
				if (!source) continue;
				const id = sourceKey(source, element.id);
				const item = catalog.get(id) ?? { id, source, noteTitles: [] };
				if (!item.noteTitles.includes(note.title)) item.noteTitles.push(note.title);
				catalog.set(id, item);
			}
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

	createEffect(() => {
		if (!props.open) { setNotes([]); setLoadingNotes(false); return; }
		let active = true;
		setLoadingNotes(true);
		void props.loadNotes().then((loaded) => {
			if (active) setNotes(loaded);
			props.releaseLoadedNotes();
		}).catch((error) => {
			if (active) console.error("Could not load notes for media catalog", error);
			props.releaseLoadedNotes();
		}).finally(() => {
			if (active) setLoadingNotes(false);
		});
		onCleanup(() => { active = false; });
	});

	createEffect(() => {
		const open = props.open;
		const catalog = media();
		if (!open || !isTauriRuntime() || !catalog.length) {
			clearSources();
			return;
		}

		const currentRequest = ++requestId;
		let active = true;
		const imageEntries = catalog.filter((item) => item.source.type === "image" && "imageId" in item.source);
		const imageIds = new Set(imageEntries.map((item) => item.id));
		const cached = untrack(sources);
		const retained: Record<string, string> = {};
		for (const [id, source] of Object.entries(cached)) {
			if (imageIds.has(id)) retained[id] = source;
			else {
				URL.revokeObjectURL(source);
				objectUrls.delete(source);
			}
		}
		setSources(retained);
		const pending = imageEntries.filter((item) => !retained[item.id]);
		let nextImage = 0;
		const isCurrent = (): boolean => active && currentRequest === requestId;
		const loadImages = async (): Promise<void> => {
			while (isCurrent()) {
				const item = pending[nextImage++];
				if (!item) return;
				if (item.source.type !== "image" || !("imageId" in item.source)) continue;
				try {
					const source = await readImageSource(item.source.imageId);
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
		});
		for (let worker = 0; worker < Math.min(IMAGE_LOAD_CONCURRENCY, pending.length); worker++) {
			void loadImages();
		}
	});

	onCleanup(clearSources);

	createEffect(() => {
		if (!props.open) setQuery("");
	});

	const close = (): void => {
		props.onClose();
	};

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
		if (!isTauriRuntime()) {
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
		loadingNotes,
		setQuery,
		sources,
		filtered,
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
