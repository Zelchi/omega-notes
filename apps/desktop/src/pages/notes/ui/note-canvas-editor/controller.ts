import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import {
	createAudioElement,
	createEditableNoteReferences,
	createImageElement,
	createVideoElement,
	type NoteDocument,
	type NoteElement,
	type NotePositionedElement,
	type NoteSummary,
	type NoteTextElement,
	type NoteTextAlignment,
} from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { ImportedMedia } from "../../model/media";
import { openExternalUrl as openTauriExternalUrl } from "../../api/external-link.repository";
import { onMediaFilesDropped } from "../../api/media.repository";
import { attachMediaFiles, importClipboardImages, importMediaPaths } from "../../model/media-import";
import type { TextFormat, TextFormatHandler } from "@/features/format-text";
import type { ParagraphAlignmentHandler } from "@/features/align-text";

export type NoteCanvasEditorProps = {
	noteId: string;
	noteTitle: string;
	document: NoteDocument;
	notes: NoteSummary[];
	referenceTitles: Record<string, string>;
	mode: "edit" | "view";
	t: (key: TranslationKey) => string;
	onChange: (document: NoteDocument) => void;
	onDelete?: () => void;
	deleteDisabled?: boolean;
	onOpenNote: (note: NoteSummary) => void;
	onOpenMissingNote?: (target: string) => void;
	onPositioningChange?: (active: boolean) => void;
};

type AttachmentPosition = { x: number; y: number };
const PAGE_MARGIN = 32;
const PAGE_BORDER = 1;
const EMPTY_TEXT_HEIGHT = 26.4;
const POSITIONING_ACTIONS_SPACE = 48;

export const useNoteCanvasEditorController = (props: NoteCanvasEditorProps) => {
	let active = true;
	onCleanup(() => { active = false; });
	const [pasteError, setPasteError] = createSignal(false);
	let pasteErrorTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(pasteErrorTimer));
	let paper!: HTMLDivElement;
	let textFormatHandler: TextFormatHandler | undefined;
	let textAlignmentHandler: ParagraphAlignmentHandler | undefined;
	const [textAlignment, setTextAlignment] = createSignal<NoteTextAlignment | undefined>("left");
	const [catalogOpen, setCatalogOpen] = createSignal(false);
	const [textContentBottom, setTextContentBottom] = createSignal(PAGE_BORDER + PAGE_MARGIN + EMPTY_TEXT_HEIGHT);
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
						return positioned.y + positioned.height + PAGE_MARGIN + PAGE_BORDER * 2 +
							(positioningElementId() === element.id ? POSITIONING_ACTIONS_SPACE : 0);
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

	const referenceNotes = createMemo(() => props.notes.map(({ id, title }) => ({ id, title })), undefined, {
		equals: (previous, next) => previous.length === next.length &&
			previous.every((note, index) => note.id === next[index].id && note.title === next[index].title),
	});
	const editableReferences = createMemo(() => {
		const current = referenceNotes();
		const ids = new Set(current.map((note) => note.id));
		return createEditableNoteReferences([
			...current,
			...Object.entries(props.referenceTitles).filter(([id]) => !ids.has(id)).map(([id, title]) => ({ id, title })),
		]);
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
					text: editableReferences().display(text.text),
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
		const storedText = props.document.elements.find((element): element is NoteTextElement => element.type === "text")!;
		props.onChange({ ...document, elements: [{ ...text, text: storedText.text }, ...positionedElements] });
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
		props.onChange({ ...base, elements: [{ ...text, text: editableReferences().store(next.text), paragraphAlignments: next.paragraphAlignments }, ...positionedElements] });
	};

	const updateTextAlignment = (alignment: NoteTextAlignment): void => {
		textAlignmentHandler?.(alignment);
	};

	const insertMedia = (sources: ImportedMedia[], position: AttachmentPosition = { x: PAGE_MARGIN, y: PAGE_MARGIN }): void => {
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

	const startMediaPositioning = (elementId: string, event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!editable()) return;
		if (positioningElementId() === elementId) {
			placeElement();
			return;
		}
		if (positioningElementId()) return;
		positionElement(elementId);
	};

	const removeElement = (elementId: string): void => {
		if (!editable() || elementId !== positioningElementId()) return;
		const base = flowDocument();
		emitDocument({ ...base, elements: base.elements.filter((element) => element.id !== elementId) });
		setPreviewElement(undefined);
		if (positioningElementId() === elementId) {
			const [next, ...remaining] = positioningQueue();
			setPositioningQueue(remaining);
			setPositioningElementId(next);
		}
	};

	const positionElement = (elementId: string): void => {
		setPositioningQueue([]);
		setPositioningElementId(elementId);
	};

	const placeElement = (): void => {
		const [next, ...remaining] = positioningQueue();
		setPositioningQueue(remaining);
		setPositioningElementId(next);
	};

	const showMediaCatalog = (): void => {
		setCatalogOpen(true);
	};

	const importMedia = async (
		load: (canImport: () => boolean) => Promise<ImportedMedia[]>,
		position?: AttachmentPosition,
	): Promise<void> => {
		const noteId = props.noteId;
		const canImport = () => active && editable() && props.noteId === noteId;
		if (!canImport()) return;
		const sources = await load(canImport);
		if (canImport()) insertMedia(sources, position);
	};
	const importFiles = (files: File[]): Promise<void> => {
		return importMedia((canImport) => attachMediaFiles(files, canImport));
	};
	const pasteImages = (files: File[]): void => {
		if (!editable() || positioningElementId()) return;
		const noteId = props.noteId;
		setPasteError(false);
		const canImport = () => active && editable() && props.noteId === noteId;
		void importClipboardImages(files, canImport).then((media) => {
			if (canImport()) insertMedia(media);
		}).catch((error) => {
			console.error(error);
			if (!active || props.noteId !== noteId) return;
			setPasteError(true);
			clearTimeout(pasteErrorTimer);
			pasteErrorTimer = setTimeout(() => setPasteError(false), 3000);
		});
	};
	const importPaths = (paths: string[]): Promise<void> => {
		return importMedia((canImport) => importMediaPaths(paths, canImport));
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
				void importMedia((canImport) => importMediaPaths(paths, canImport), position).catch(console.error);
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
		const onDrop = (event: DragEvent) => {
			if (!editable() || !event.dataTransfer?.files.length) return;
			event.preventDefault();
			if (positioningElementId()) return;
			const files = [...event.dataTransfer.files];
			void importMedia((canImport) => attachMediaFiles(files, canImport), pointOnPage(event.clientX, event.clientY)).catch(console.error);
		};
		paper.addEventListener("dragover", onDragOver);
		paper.addEventListener("drop", onDrop);
		onCleanup(() => {
			paper.removeEventListener("dragover", onDragOver);
			paper.removeEventListener("drop", onDrop);
		});
	});

	return {
		setTextAlignmentHandler: (handler: ParagraphAlignmentHandler | undefined) => (textAlignmentHandler = handler),
		setTextAlignment,
		setTextFormatHandler: (handler: TextFormatHandler | undefined) => (textFormatHandler = handler),
		formatText: (format: TextFormat) => textFormatHandler?.(format),
		catalogOpen,
		editable,
		flowDocument,
		textAlignment,
		positionedElementsOnPage,
		positioningElementId,
		renderedPageHeight,
		setPaper: (element: HTMLDivElement) => (paper = element),
		setCatalogOpen,
		setPreviewElement,
		setTextContentBottom,
		updateElement,
		updateText,
		updateTextAlignment,
		insertMedia,
		openExternalLink,
		startMediaPositioning,
		removeElement,
		placeElement,
		showMediaCatalog,
		importFiles,
		pasteImages,
		pasteError,
		importPaths,
	};
};
