import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import {
	createAudioElement,
	createImageElement,
	createVideoElement,
	type NoteDocument,
	type NoteElement,
	type NotePositionedElement,
	type StudyNote,
	type NoteTextElement,
	type NoteTextAlignment,
} from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { ImportedMedia } from "../../model/media";
import { openExternalUrl as openTauriExternalUrl } from "../../api/external-link.repository";
import { onMediaFilesDropped } from "../../api/media.repository";
import { attachMediaFiles, importMediaPaths } from "../../model/media-import";
import type { TextFormat, TextFormatHandler } from "@/features/format-text";

export type NoteCanvasEditorProps = {
	document: NoteDocument;
	notes: StudyNote[];
	mode: "edit" | "view";
	t: (key: TranslationKey) => string;
	onChange: (document: NoteDocument) => void;
	onOpenNote: (note: StudyNote) => void;
	onPositioningChange?: (active: boolean) => void;
	onExportPdf?: () => Promise<void>;
	exportPdfDisabled?: boolean;
};

type AttachmentPosition = { x: number; y: number };
export type ContextMenuState = { kind: "note" | "image" | "media"; x: number; y: number; elementId?: string };
const PAGE_MARGIN = 32;
const PAGE_BORDER = 1;
const EMPTY_TEXT_HEIGHT = 26.4;

export const useNoteCanvasEditorController = (props: NoteCanvasEditorProps) => {
	let paper!: HTMLDivElement;
	let textFormatHandler: TextFormatHandler | undefined;
	const [contextMenu, setContextMenu] = createSignal<ContextMenuState>();
	const [catalogOpen, setCatalogOpen] = createSignal(false);
	const [textContentBottom, setTextContentBottom] = createSignal(PAGE_BORDER + PAGE_MARGIN + EMPTY_TEXT_HEIGHT);
	const [attachmentPosition, setAttachmentPosition] = createSignal<AttachmentPosition>({
		x: PAGE_MARGIN,
		y: PAGE_MARGIN,
	});
	const [previewElement, setPreviewElement] = createSignal<NotePositionedElement>();
	const [positioningElementId, setPositioningElementId] = createSignal<string>();
	const [positioningQueue, setPositioningQueue] = createSignal<string[]>([]);
	const editable = createMemo(() => props.mode === "edit");
	const renderedPageHeight = createMemo(() => {
		const preview = previewElement();
		return Math.ceil(
			Math.max(
				props.document.page.height,
				textContentBottom() + PAGE_MARGIN + PAGE_BORDER * 2,
				...props.document.elements
					.filter((element): element is NotePositionedElement => element.type !== "text")
					.map((element) => {
						const positioned = preview?.id === element.id ? preview : element;
						return positioned.y + positioned.height + PAGE_MARGIN + PAGE_BORDER * 2;
					}),
			),
		);
	});

	createEffect(() => {
		if (!editable()) {
			setPositioningElementId(undefined);
			setPositioningQueue([]);
		}
	});

	createEffect(() => {
		props.onPositioningChange?.(Boolean(positioningElementId()));
	});

	const flowDocument = createMemo<NoteDocument>(() => {
		const text = props.document.elements.find(
			(element): element is NoteTextElement => element.type === "text",
		)!;
		const positionedElements = props.document.elements.filter(
			(element): element is NotePositionedElement => element.type !== "text",
		);
		return {
			...props.document,
			elements: [
				{
					...text,
					x: PAGE_MARGIN,
					y: PAGE_MARGIN,
					width: props.document.page.width - PAGE_MARGIN * 2 - PAGE_BORDER * 2,
					height: props.document.page.height - PAGE_MARGIN * 2 - PAGE_BORDER * 2,
					text: text.text,
					alignment: text.alignment,
				},
				...positionedElements,
			] satisfies NoteElement[],
		};
	});

	const positionedElementsOnPage = (): NotePositionedElement[] => {
		const preview = previewElement();
		return flowDocument().elements.flatMap((element) => {
			if (element.type === "text") return [];
			return [preview?.id === element.id ? preview : element];
		});
	};

	const pointOnPage = (clientX: number, clientY: number): AttachmentPosition => {
		const bounds = paper.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(props.document.page.width - 48, Math.round(clientX - bounds.left))),
			y: Math.max(0, Math.min(renderedPageHeight() - 48, Math.round(clientY - bounds.top))),
		};
	};

	const emitDocument = (document: NoteDocument): void => {
		const base = flowDocument();
		const text = base.elements.find((element): element is NoteTextElement => element.type === "text")!;
		const positionedElements = document.elements.filter(
			(element): element is NotePositionedElement => element.type !== "text",
		);
		props.onChange({ ...document, elements: [text, ...positionedElements] });
	};

	const updateElement = (next: NoteElement): void => {
		const base = flowDocument();
		const document = {
			...base,
			elements: base.elements.map((element) => (element.id === next.id ? next : element)),
		};
		emitDocument(document);
	};

	const updateText = (next: NoteTextElement): void => {
		const base = flowDocument();
		const text = base.elements[0] as NoteTextElement;
		const positionedElements = base.elements.filter(
			(element): element is NotePositionedElement => element.type !== "text",
		);
		props.onChange({ ...base, elements: [{ ...text, text: next.text }, ...positionedElements] });
	};

	const updateTextAlignment = (alignment: NoteTextAlignment): void => {
		const base = flowDocument();
		const text = base.elements[0] as NoteTextElement;
		props.onChange({ ...base, elements: [{ ...text, alignment }, ...base.elements.slice(1)] });
	};

	const textAlignment = createMemo(() => {
		const text = flowDocument().elements.find((element): element is NoteTextElement => element.type === "text");
		return text!.alignment;
	});

	const insertMedia = (sources: ImportedMedia[], position = attachmentPosition()): void => {
		if (!sources.length) return;
		const base = flowDocument();
		const elements = sources.map((source, index) => {
			const x = Math.max(0, Math.min(props.document.page.width - 360, position.x + index * 20));
			const y = Math.max(0, Math.min(renderedPageHeight() - 200, position.y + index * 20));
			if (source.type === "image") {
				return "imageId" in source
					? createImageElement({ imageId: source.imageId }, x, y)
					: createImageElement({ dataUrl: source.dataUrl }, x, y);
			}
			if (source.type === "audio") {
				return "audioId" in source
					? createAudioElement({ audioId: source.audioId, extension: source.extension }, x, y)
					: createAudioElement({ dataUrl: source.dataUrl, extension: source.extension }, x, y);
			}
			return "videoId" in source
				? createVideoElement({ videoId: source.videoId, extension: source.extension }, x, y)
				: createVideoElement({ dataUrl: source.dataUrl, extension: source.extension }, x, y);
		});
		emitDocument({ ...base, elements: [...base.elements, ...elements] });
		setPositioningQueue(elements.slice(1).map((element) => element.id));
		setPositioningElementId(elements[0]?.id);
	};

	const openContextMenu = (event: MouseEvent): void => {
		if (!editable()) return;
		event.preventDefault();
		event.stopPropagation();
		if (positioningElementId()) return;
		setAttachmentPosition(pointOnPage(event.clientX, event.clientY));
		setContextMenu({
			kind: "note",
			x: Math.max(8, Math.min(event.clientX, innerWidth - 168)),
			y: Math.max(8, Math.min(event.clientY, innerHeight - 60)),
		});
	};

	const openImageContextMenu = (elementId: string, event: MouseEvent): void => {
		if (!editable()) return;
		event.preventDefault();
		event.stopPropagation();
		setContextMenu({
			kind: "image",
			elementId,
			x: Math.max(8, Math.min(event.clientX, innerWidth - 168)),
			y: Math.max(8, Math.min(event.clientY, innerHeight - 60)),
		});
	};

	const removeElement = (): void => {
		const elementId = contextMenu()?.elementId;
		if (!elementId) return;
		const base = flowDocument();
		emitDocument({ ...base, elements: base.elements.filter((element) => element.id !== elementId) });
		if (positioningElementId() === elementId) {
			const [next, ...remaining] = positioningQueue();
			setPositioningQueue(remaining);
			setPositioningElementId(next);
		}
		setContextMenu(undefined);
	};

	const positionElement = (elementId: string): void => {
		setPositioningQueue([]);
		setPositioningElementId(elementId);
		setContextMenu(undefined);
	};

	const placeElement = (): void => {
		const [next, ...remaining] = positioningQueue();
		setPositioningQueue(remaining);
		setPositioningElementId(next);
		setContextMenu(undefined);
	};

	const showMediaCatalog = (): void => {
		setContextMenu(undefined);
		setCatalogOpen(true);
	};

	const importFiles = async (files: File[]): Promise<void> => {
		insertMedia(await attachMediaFiles(files));
	};
	const importPaths = async (paths: string[]): Promise<void> => {
		insertMedia(await importMediaPaths(paths));
	};
	const openExternalLink = (url: string): void => {
		if (isTauriRuntime()) void openTauriExternalUrl(url).catch(() => undefined);
	};

	onMount(() => {
		if (isTauriRuntime()) {
			let unlisten: (() => void) | undefined;
			let active = true;
			void onMediaFilesDropped(({ paths, x, y }) => {
				if (!editable() || positioningElementId()) return;
				const bounds = paper.getBoundingClientRect();
				if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
				const position = pointOnPage(x, y);
				void importMediaPaths(paths)
					.then((media) => {
						if (active) insertMedia(media, position);
					})
					.catch(console.error);
			})
				.then((stop) => {
					if (active) unlisten = stop;
					else stop();
				})
				.catch(console.error);
			onCleanup(() => {
				active = false;
				unlisten?.();
			});
			return;
		}

		const onDragOver = (event: DragEvent) => {
			if (editable() && event.dataTransfer?.files.length) event.preventDefault();
		};
		const insertMediaFromDrop = async (files: File[], position: AttachmentPosition): Promise<void> => {
			const sources = await attachMediaFiles(files);
			insertMedia(sources, position);
		};
		const onDrop = (event: DragEvent) => {
			if (!editable() || !event.dataTransfer?.files.length) return;
			event.preventDefault();
			if (positioningElementId()) return;
			const files = [...event.dataTransfer.files];
			void insertMediaFromDrop(files, pointOnPage(event.clientX, event.clientY));
		};
		paper.addEventListener("dragover", onDragOver);
		paper.addEventListener("drop", onDrop);
		onCleanup(() => {
			paper.removeEventListener("dragover", onDragOver);
			paper.removeEventListener("drop", onDrop);
		});
	});

	return {
		setTextFormatHandler: (handler: TextFormatHandler | undefined) => (textFormatHandler = handler),
		formatText: (format: TextFormat) => textFormatHandler?.(format),
		contextMenu,
		catalogOpen,
		editable,
		flowDocument,
		textAlignment,
		positionedElementsOnPage,
		positioningElementId,
		renderedPageHeight,
		setPaper: (element: HTMLDivElement) => (paper = element),
		setContextMenu,
		setCatalogOpen,
		setPreviewElement,
		setTextContentBottom,
		updateElement,
		updateText,
		updateTextAlignment,
		insertMedia,
		openExternalLink,
		openContextMenu,
		openImageContextMenu,
		openMediaContextMenu: (elementId: string, event: MouseEvent) => {
			if (!editable()) return;
			event.preventDefault();
			event.stopPropagation();
			setContextMenu({
				kind: "media",
				elementId,
				x: Math.max(8, Math.min(event.clientX, innerWidth - 168)),
				y: Math.max(8, Math.min(event.clientY, innerHeight - 60)),
			});
		},
		removeElement,
		positionElement,
		placeElement,
		showMediaCatalog,
		importFiles,
		importPaths,
	};
};
