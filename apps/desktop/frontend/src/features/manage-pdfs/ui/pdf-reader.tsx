import { createEffect, createMemo, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type Component } from "solid-js";
import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { displayNoteTitle, NOTE_TITLE_MAX_LENGTH, type NoteSummary } from "@/entities/note";
import { NoteLinkSuggestions, useNoteLinkSuggestions } from "@/features/suggest-note-link";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { openUrl } from "@/shared/lib/desktop";
import { CustomScrollbars, useCustomScrollArea } from "@/shared/ui/custom-scroll-area";
import { addPdfHighlight, deletePdfHighlight, getPdfDocumentStreamUrl, pdfHighlightColors, readPdfHighlights, updatePdfHighlight, type PdfDocument, type PdfHighlight, type PdfHighlightColor } from "../api/pdfs.repository";
import { getPdfPageSpreadPages, normalizePdfPageSpreadCursor, shouldUsePdfPageSpread } from "../model/page-spread";
import { createPdfPagePreviews, getPdfPagePreviewSignature, getPdfPageRenderConfig } from "../model/page-preview";
import { arePdfPageElementsReady, type PdfPageNodes } from "../model/page-elements";
import { createPdfPageRenderer } from "../model/page-renderer";
import { createPdfReaderPanController, createPdfReaderPanHandlers } from "../model/page-pan";
import { installPdfReaderPointerLockPan } from "../model/pointer-lock-pan";
import { observePdfReaderResize } from "../model/resize-reporter";
import { getPdfHighlightAt, getPdfSelectionData } from "../model/highlight-selection";
import { createPdfHighlightActions } from "../model/highlight-actions";
import { createPdfHighlightMenu, type PdfHighlightTextMenu } from "../model/highlight-menu";
import { observePdfHighlightMenuDismissal } from "../model/highlight-menu-dismissal";
import {
	createPdfReaderNavigationController, handlePdfReaderWheelZoom,
	maxPdfZoom, minPdfZoom, pdfZoomStep,
} from "../model/reader-controls";
import { createPdfPageJumpInputHandlers } from "../model/page-jump-input";
import { createPdfReaderZoomController, findPdfReaderZoomAnchor } from "../model/zoom-position";
import { getPdfSuggestionAnchor, observePdfSuggestionAnchor, type PdfSuggestionAnchor } from "../model/pdf-suggestion-anchor";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "./pdf-panel/style.css.ts";

GlobalWorkerOptions.workerSrc = workerUrl;

type Props = {
	vaultId?: string;
	documentId: string;
	document: PdfDocument;
	notes: NoteSummary[];
	referenceTitles: Record<string, string>;
	t: (key: TranslationKey) => string;
	onBack: () => void;
	onClose: () => void;
	onOpenNote: (note: NoteSummary) => void | Promise<void>;
	onProgress: (documentId: string, page: number, pageCount: number) => void;
};

const highlightColors: Record<PdfHighlightColor, { swatch: string; background: string; selected: string }> = {
	yellow: { swatch: "#facc15", background: "rgb(250 204 21 / 38%)", selected: "rgb(234 179 8 / 54%)" },
	green: { swatch: "#4ade80", background: "rgb(74 222 128 / 36%)", selected: "rgb(34 197 94 / 52%)" },
	blue: { swatch: "#60a5fa", background: "rgb(96 165 250 / 36%)", selected: "rgb(59 130 246 / 52%)" },
	pink: { swatch: "#f472b6", background: "rgb(244 114 182 / 36%)", selected: "rgb(236 72 153 / 52%)" },
	purple: { swatch: "#c084fc", background: "rgb(192 132 252 / 36%)", selected: "rgb(168 85 247 / 52%)" },
};

const PdfReader: Component<Props> = props => {
	const scroll = useCustomScrollArea();
	const [pdf, setPdf] = createSignal<PDFDocumentProxy>();
	const [pageCount, setPageCount] = createSignal(0);
	const [pageNumber, setPageNumber] = createSignal(Math.max(1, props.document.lastPage));
	const [pageAspectRatio, setPageAspectRatio] = createSignal<number>();
	const [zoom, setZoom] = createSignal(1);
	const [panning, setPanning] = createSignal(false);
	const [busy, setBusy] = createSignal(true);
	const [renderFailed, setRenderFailed] = createSignal(false);
	const [size, setSize] = createSignal({ width: 0, height: 0 });
	const [highlights, setHighlights] = createSignal<PdfHighlight[]>([]);
	const [selectedHighlightId, setSelectedHighlightId] = createSignal<string>();
	const [textMenu, setTextMenu] = createSignal<PdfHighlightTextMenu>();
	const [pageJumpOpen, setPageJumpOpen] = createSignal(false);
	const [pageJumpValue, setPageJumpValue] = createSignal("");
	const [editColor, setEditColor] = createSignal<PdfHighlightColor>("yellow");
	const [editNoteId, setEditNoteId] = createSignal("");
	const [editNoteQuery, setEditNoteQuery] = createSignal("");
	const [noteSuggestionCaret, setNoteSuggestionCaret] = createSignal<number>();
	const [suggestionAnchor, setSuggestionAnchor] = createSignal<PdfSuggestionAnchor>({ left: 0, top: 0, height: 32 });
	const [textLayerReadyPages, setTextLayerReadyPages] = createSignal<Set<number>>(new Set());
	const [pageElementsRevision, setPageElementsRevision] = createSignal(0);
	const [highlightError, setHighlightError] = createSignal<TranslationKey>();
	const [highlightSaving, setHighlightSaving] = createSignal(false);
	let host: HTMLDivElement | undefined;
	let notePickerInput: HTMLInputElement | undefined;
	let loadRevision = 0;
	const { cancelPagePreviewTasks, clearPagePreviewCache, visiblePreviews: getVisiblePreviews, preloadAdjacentPages } = createPdfPagePreviews();
	const pageRenderer = createPdfPageRenderer({
		getRenderConfig: getPdfPageRenderConfig,
		createTextLayer: (textContent, container, viewport) => new TextLayer({
			textContentSource: textContent,
			container,
			viewport,
		}),
	});
	const panController = createPdfReaderPanController(setPanning);
	const panHandlers = createPdfReaderPanHandlers(panController, {
		isPointerLocked: viewport => document.pointerLockElement === viewport,
		isOverContextMenu: target => target instanceof Element && Boolean(target.closest(`.${styles.contextMenu}`)),
	});
	const pageElements = new Map<number, PdfPageNodes>();
	const zoomController = createPdfReaderZoomController({
		getZoom: zoom,
		setZoom: value => setZoom(value),
		getHost: () => host,
		getPageBounds: page => pageElements.get(page)?.canvas?.getBoundingClientRect(),
	});
	const noteSuggestionsId = createUniqueId();
	const spreadEnabled = createMemo(() => shouldUsePdfPageSpread(size().width, size().height, pageAspectRatio(), pageCount()));
	const visiblePages = createMemo(() => getPdfPageSpreadPages(pageNumber(), pageCount(), spreadEnabled()));
	const progressPage = createMemo(() => {
		const pages = visiblePages();
		return pages[pages.length - 1] ?? pageNumber();
	});
	const navigation = createPdfReaderNavigationController({
		pageCount,
		pageNumber,
		visiblePages,
		spreadEnabled,
		busy,
		pageJumpOpen,
		pageJumpValue,
		setPageJumpOpen: value => setPageJumpOpen(value),
		setPageJumpValue: value => setPageJumpValue(value),
		setPageNumber: update => setPageNumber(update),
		clearZoomAnchor: zoomController.clearAnchor,
		clearSelectedHighlight: () => setSelectedHighlightId(undefined),
		closeTextMenu: () => setTextMenu(undefined),
		clearBrowserSelection: () => window.getSelection()?.removeAllRanges(),
	});
	const pageJumpInput = createPdfPageJumpInputHandlers({
		setValue: setPageJumpValue,
		goToPage: navigation.goToPage,
		close: () => setPageJumpOpen(false),
	});
	createEffect(on(spreadEnabled, enabled => {
		if (enabled) setPageNumber(current => normalizePdfPageSpreadCursor(current, pageCount(), true));
	}));
	const registerPageElement = (page: number, key: "canvas" | "textLayer", element: HTMLCanvasElement | HTMLDivElement) => {
		const current = pageElements.get(page) ?? {};
		pageElements.set(page, { ...current, [key]: element });
		if (arePdfPageElementsReady(visiblePages(), pageElements)) {
			setPageElementsRevision(revision => revision + 1);
		}
	};
	const cancelPageRenderTasks = pageRenderer.cancel;
	const restoreZoomPosition = zoomController.restoreAfterRender;
	const noteLinkSuggestions = useNoteLinkSuggestions({
			notes: () => props.notes,
			text: () => `[[${editNoteQuery()}]]`,
		caretOffset: () => noteSuggestionCaret(),
		onSelect: note => {
			setEditNoteId(note.id);
			setEditNoteQuery(displayNoteTitle(note));
			setNoteSuggestionCaret(undefined);
		},
	});
	createEffect(() => {
		if (!noteLinkSuggestions.open()) return;
		onCleanup(observePdfSuggestionAnchor({
			getInput: () => notePickerInput,
			windowTarget: window,
			scrollTarget: host,
			setAnchor: value => setSuggestionAnchor(value),
			requestFrame: callback => requestAnimationFrame(callback),
			cancelFrame: frame => cancelAnimationFrame(frame),
		}));
	});

	createEffect(on(() => [props.vaultId, props.documentId] as const, ([vaultId, documentId]) => {
		const revision = ++loadRevision;
		let loadingTask: ReturnType<typeof getDocument> | undefined;
		let loadedDocument: PDFDocumentProxy | undefined;
		setPdf(undefined);
		setPageCount(0);
		setPageNumber(Math.max(1, props.document.lastPage));
		setPageJumpOpen(false);
		setPageJumpValue("");
		setPageAspectRatio(undefined);
		setBusy(true);
		setRenderFailed(false);
		setHighlights([]);
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		setTextLayerReadyPages(new Set<number>());
		setHighlightError(undefined);
		setHighlightSaving(false);
		zoomController.resetDocument();
		if (vaultId && documentId) {
			void (async () => {
				try {
					const url = await getPdfDocumentStreamUrl(vaultId, documentId);
					if (revision !== loadRevision) return;
					const staticAssetUrl = (directory: string) => import.meta.env.VITE_DESKTOP_RUNTIME !== "tauri"
						? `omega-image://static/pdfjs/${directory}/`
						: new URL(`${import.meta.env.BASE_URL}pdfjs/${directory}/`, window.location.href).href;
					loadingTask = getDocument({
						url,
						rangeChunkSize: 128 * 1024,
						disableStream: true,
						disableAutoFetch: true,
						cMapUrl: staticAssetUrl("cmaps"),
						cMapPacked: true,
						iccUrl: staticAssetUrl("iccs"),
						standardFontDataUrl: staticAssetUrl("standard_fonts"),
						wasmUrl: staticAssetUrl("wasm"),
					});
					loadedDocument = await loadingTask.promise;
					const firstPage = await loadedDocument.getPage(1);
					const firstPageViewport = firstPage.getViewport({ scale: 1 });
					if (revision !== loadRevision) return;
					setPageAspectRatio(firstPageViewport.width / firstPageViewport.height);
					let savedHighlights: PdfHighlight[] = [];
					try {
						savedHighlights = await readPdfHighlights(vaultId, documentId);
					} catch {
						if (revision === loadRevision) setHighlightError("pdfHighlightsLoadFailed");
					}
					if (revision !== loadRevision) { await loadingTask.destroy(); return; }
					setPageCount(loadedDocument.numPages);
					setPageNumber(Math.min(Math.max(1, props.document.lastPage), loadedDocument.numPages));
					setHighlights(savedHighlights);
					setPdf(loadedDocument);
				} catch {
					if (revision === loadRevision) {
						setBusy(false);
						setRenderFailed(true);
					}
				}
			})();
		}
		onCleanup(() => {
			if (loadRevision === revision) loadRevision += 1;
			cancelPagePreviewTasks();
			cancelPageRenderTasks();
			clearPagePreviewCache();
			if (loadingTask) void loadingTask.destroy();
		});
	}));

	onMount(() => {
		onCleanup(observePdfReaderResize(host, value => setSize(value)));
	});

	createEffect(on(() => [
		pdf(),
		pageNumber(),
		zoom(),
		size().width,
		size().height,
		spreadEnabled(),
		visiblePages().join(","),
		pageElementsRevision(),
	] as const, ([document, , scaleFactor, width, height, spread]) => {
		if (!document || width < 1 || height < 1) return;
		const pages = [...visiblePages()];
		if (!arePdfPageElementsReady(pages, pageElements)) return;
		let cancelled = false;
		const expectedSignatures = new Map(pages.map(page => [
			page,
			getPdfPagePreviewSignature(width, height, scaleFactor, pages.length > 1),
		]));
		const visiblePreviews = getVisiblePreviews(pages, width, height, scaleFactor);
		cancelPagePreviewTasks();
		cancelPageRenderTasks();
		for (const page of pages) pageElements.get(page)?.textLayer?.replaceChildren();
		setTextLayerReadyPages(new Set<number>());
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		window.getSelection()?.removeAllRanges();
		setBusy(!pages.every(page => visiblePreviews.get(page)?.signature === expectedSignatures.get(page)));
		setRenderFailed(false);
		void (async () => {
			const result = await pageRenderer.render({
				document,
				pages,
				pageElements,
				width,
				height,
				scaleFactor,
				expectedSignatures,
				previews: visiblePreviews,
				onTextLayerReady: page => setTextLayerReadyPages(current => new Set(current).add(page)),
				onTextLayerError: () => setHighlightError("pdfTextLayerFailed"),
			});
			if (cancelled || result.status === "cancelled") return;
			if (result.status === "failed") {
				if (!(result.error instanceof Error && result.error.name === "RenderingCancelledException")) {
					setBusy(false);
					setRenderFailed(true);
				}
				return;
			}
			restoreZoomPosition();
			setBusy(false);
			props.onProgress(props.document.id, progressPage(), document.numPages);
			void preloadAdjacentPages(document, pages, document.numPages, width, height, scaleFactor, spread);
		})();
		onCleanup(() => {
			cancelled = true;
			cancelPageRenderTasks();
			cancelPagePreviewTasks();
		});
	}));

	const openSelectionMenu = (page: number, textLayerContainer: HTMLDivElement, event: MouseEvent) => {
		const selection = getPdfSelectionData(textLayerContainer, window.getSelection());
		const existingHighlight = getPdfHighlightAt(highlights(), page, textLayerContainer, event.clientX, event.clientY);
		if (!host) return;
		event.preventDefault();
		event.stopPropagation();
		const bounds = host.getBoundingClientRect();
		const menu = createPdfHighlightMenu({
			selection,
			existingHighlight,
			page,
			cursorX: event.clientX,
			cursorY: event.clientY,
			host,
			hostBounds: bounds,
		});
		if (!menu) return;
		setSelectedHighlightId(menu.highlightId);
		setTextMenu(menu);
	};
	const beginEditHighlight = (highlightId: string) => {
		const highlight = highlights().find(item => item.id === highlightId);
		if (!highlight || !host) return;
		const linkedNote = highlight.noteId ? props.notes.find(note => note.id === highlight.noteId) : undefined;
		setEditColor(highlight.color);
		setEditNoteId(highlight.noteId ?? "");
		setEditNoteQuery(linkedNote ? displayNoteTitle(linkedNote)
			: highlight.noteId ? props.referenceTitles[highlight.noteId] ?? props.t("pdfHighlightUnavailableNote") : "");
		setNoteSuggestionCaret(undefined);
		setTextMenu(current => {
			if (!current) return current;
			const maxY = host!.scrollTop + host!.clientHeight - 224 - 8;
			return { ...current, mode: "edit", y: Math.max(host!.scrollTop + 8, Math.min(current.y, maxY)) };
		});
	};
	const openLinkedHighlight = (page: number, textLayerContainer: HTMLDivElement, event: MouseEvent) => {
		const highlight = getPdfHighlightAt(highlights(), page, textLayerContainer, event.clientX, event.clientY);
		setSelectedHighlightId(highlight?.id);
		if (!highlight?.noteId) return;
		const note = props.notes.find(item => item.id === highlight.noteId);
		if (!note) return;
		setTextMenu(undefined);
		props.onClose();
		void Promise.resolve(props.onOpenNote(note)).catch(console.error);
	};
	createEffect(() => {
		if (!textMenu()) return;
		onCleanup(observePdfHighlightMenuDismissal({
			windowTarget: window,
			isInsideMenu: target => target instanceof Element
				&& Boolean(target.closest(`.${styles.contextMenu}`) || target.closest('[role="listbox"]')),
			isSuggestionInput: target => target === notePickerInput,
			suggestionsOpen: noteLinkSuggestions.open,
			closeMenu: () => setTextMenu(undefined),
		}));
	});
	const { saveSelectionAsHighlight, saveHighlightEdit, removeHighlight } = createPdfHighlightActions({
		vaultId: () => props.vaultId,
		documentId: () => props.document.id,
		revision: () => loadRevision,
		menu: textMenu,
		readyPages: textLayerReadyPages,
		highlights,
		saving: highlightSaving,
		editColor,
		editNoteId,
		setSaving: setHighlightSaving,
		setError: setHighlightError,
		setHighlights,
		setSelected: setSelectedHighlightId,
		closeMenu: () => setTextMenu(undefined),
		clearSelection: () => window.getSelection()?.removeAllRanges(),
		createId: () => crypto.randomUUID(),
		add: addPdfHighlight,
		update: updatePdfHighlight,
		remove: deletePdfHighlight,
	});
	const copyMenuText = (menu: PdfHighlightTextMenu) => {
		void navigator.clipboard.writeText(menu.text).catch(console.error);
		setTextMenu(undefined);
	};
	const searchMenuText = (menu: PdfHighlightTextMenu) => {
		void openUrl(`https://www.google.com/search?q=${encodeURIComponent(menu.text)}`).catch(console.error);
		setTextMenu(undefined);
	};

	const getPdfZoomAnchor = (event: WheelEvent) => findPdfReaderZoomAnchor(
		pageElements,
		elements => elements.canvas?.getBoundingClientRect(),
		event,
	);
	const changeZoom = (delta: number, anchor?: ReturnType<typeof getPdfZoomAnchor>) =>
		zoomController.change(delta, anchor);
	const resetZoom = zoomController.reset;
	const handlePdfWheel = (event: WheelEvent) =>
		handlePdfReaderWheelZoom(event, pageCount(), () => getPdfZoomAnchor(event), changeZoom);
	const finishPan = panController.finish;
	onMount(() => {
		const viewport = host;
		if (!viewport) return;
		onCleanup(installPdfReaderPointerLockPan({
			isHovered: () => viewport.matches(":hover"),
			hasPointerLock: () => Boolean(document.pointerLockElement),
			isViewportLocked: () => document.pointerLockElement === viewport,
			requestLock: viewport.requestPointerLock ? () => viewport.requestPointerLock() : undefined,
			exitLock: () => document.exitPointerLock(),
			activatePan: panController.activate,
			resetPanPointer: panController.resetPointer,
			finishPan,
		}, { windowTarget: window, documentTarget: document }));
	});
	const ReaderToolbar = () => (
		<div class={styles.readerToolbar}>
			<Button class={styles.iconButton} type="button" disabled={(visiblePages()[0] ?? pageNumber()) <= 1 || busy()} onClick={() => navigation.movePage(-1)}><Icon name="back" size={15} /></Button>
			<Show when={pageJumpOpen()} fallback={
				<Button class={styles.pageJumpButton} type="button" disabled={!pageCount() || busy()} onClick={navigation.openPageJump}>
					{pageCount() ? `${visiblePages()[0]}${visiblePages().length > 1 ? `–${progressPage()}` : ""} / ${pageCount()}` : "—"}
				</Button>
			}>
				<input
					class={styles.pageJumpInput}
					ref={element => { element.focus(); element.select(); }}
					type="number"
					min="1"
					max={pageCount()}
					step="1"
					value={pageJumpValue()}
					onInput={pageJumpInput.input}
					onBlur={pageJumpInput.blur}
					onKeyDown={pageJumpInput.keyDown}
				/>
			</Show>
			<Button class={styles.iconButton} type="button" disabled={!pageCount() || progressPage() >= pageCount() || busy()} onClick={() => navigation.movePage(1)}><Icon name="chevronRight" size={15} /></Button>
			<span style={{ width: "8px" }} />
			<Button class={styles.iconButton} type="button" disabled={zoom() <= minPdfZoom} onClick={() => changeZoom(-pdfZoomStep)}><Icon name="zoomOut" size={15} /></Button>
			<Button class={styles.pageJumpButton} type="button" onClick={resetZoom}>{Math.round(zoom() * 100)}%</Button>
			<Button class={styles.iconButton} type="button" disabled={zoom() >= maxPdfZoom} onClick={() => changeZoom(pdfZoomStep)}><Icon name="zoomIn" size={15} /></Button>
		</div>
	);

	return (
		<>
			<div class={`${styles.header} ${spreadEnabled() ? styles.readerSpreadHeader : styles.readerCompactHeader}`}>
				<div class={styles.readerHeaderStart}>
					<Button class={styles.iconButton} type="button" onClick={props.onBack}><Icon name="back" size={16} /></Button>
					<h2 class={styles.headerTitle}>{props.document.title}</h2>
				</div>
				<Show when={spreadEnabled()}><ReaderToolbar /></Show>
				<Button class={`${styles.iconButton} ${styles.readerHeaderClose}`} type="button" onClick={props.onClose}><Icon name="close" size={16} /></Button>
			</div>
			<Show when={!spreadEnabled()}><ReaderToolbar /></Show>
			<Show when={highlightError()}>{key => <p class={styles.highlightError}>{props.t(key())}</p>}</Show>
			<div class={styles.readerScrollRoot} ref={scroll.setRoot}
				onPointerMove={scroll.moveThumb}
				onPointerUp={scroll.finishDrag}
				onPointerCancel={scroll.finishDrag}
				onLostPointerCapture={scroll.finishDrag}
			>
				<div class={styles.readerSurface} ref={element => { host = element; scroll.setViewport(element); }} data-omega-scroll-viewport="" onScroll={scroll.updateMetrics} onWheel={handlePdfWheel}
					classList={{ [styles.readerPanning]: panning() }}
					onPointerEnter={panHandlers.move}
					onPointerMove={panHandlers.move}
					onMouseMove={panHandlers.moveLocked}
					onPointerLeave={finishPan}
					onPointerCancel={finishPan}
				>
				<div class={styles.pageSpread} ref={scroll.setContent}>
					<For each={visiblePages()}>{page => {
						onCleanup(() => pageElements.delete(page));
						return (
							<div class={styles.pageFrame}>
								<canvas class={styles.canvas} ref={element => registerPageElement(page, "canvas", element)} />
								<div class={styles.highlightLayer}>
									<For each={highlights().filter(highlight => highlight.page === page)}>{highlight =>
										<For each={highlight.rects}>{rect =>
											<div
												class={`${styles.highlightMark} ${selectedHighlightId() === highlight.id ? styles.highlightMarkSelected : ""}`}
												style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, background: selectedHighlightId() === highlight.id ? highlightColors[highlight.color].selected : highlightColors[highlight.color].background }}
											/>
										}</For>
									}</For>
								</div>
								<div
									class={styles.textLayer}
									ref={element => registerPageElement(page, "textLayer", element)}
									onClick={event => openLinkedHighlight(page, event.currentTarget, event)}
									onContextMenu={event => openSelectionMenu(page, event.currentTarget, event)}
								/>
							</div>
						);
					}}</For>
				</div>
				<Show when={textMenu()}>{menu =>
					<div
						class={`${styles.contextMenu} ${menu().mode === "edit" ? styles.editHighlightMenu : ""}`}
						style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
						onPointerDown={event => event.stopPropagation()}
						onContextMenu={event => event.preventDefault()}
					>
						<Show when={menu().mode === "actions"} fallback={
							<>
								<div class={styles.editHighlightTitle}>{props.t("pdfEditHighlight")}</div>
								<div class={styles.editHighlightField}>
									<span>{props.t("pdfHighlightColor")}</span>
									<div class={styles.highlightColorOptions}>
										<For each={pdfHighlightColors}>{color =>
											<Button
												class={styles.highlightColorButton}
												type="button"
												style={{ background: highlightColors[color].swatch, outline: editColor() === color ? "2px solid var(--ink)" : undefined, "outline-offset": "2px" }}
												disabled={highlightSaving()}
												onClick={() => setEditColor(color)}
											>
												<Show when={editColor() === color}><Icon name="check" size={13} /></Show>
											</Button>
										}</For>
									</div>
								</div>
								<div class={styles.editHighlightField}>
									<span>{props.t("pdfHighlightNote")}</span>
									<input
										class={styles.textInput}
										type="search"
										value={editNoteQuery()}
										maxLength={NOTE_TITLE_MAX_LENGTH}
										placeholder={props.t("pdfHighlightNoteSearch")}
										disabled={highlightSaving()}
										ref={element => { notePickerInput = element; }}
										onFocus={() => {
											const anchor = getPdfSuggestionAnchor(notePickerInput);
											if (anchor) setSuggestionAnchor(anchor);
											setNoteSuggestionCaret(editNoteQuery().length + 2);
										}}
										onBlur={() => setNoteSuggestionCaret(undefined)}
										onInput={event => {
											const query = event.currentTarget.value;
											setEditNoteQuery(query);
											setEditNoteId("");
											setNoteSuggestionCaret(query.length + 2);
										}}
										onKeyDown={noteLinkSuggestions.handleKeyDown}
									/>
								</div>
								<div class={styles.editHighlightActions}>
									<Button class={styles.contextMenuButton} type="button" disabled={highlightSaving()} onClick={() => { const id = menu().highlightId; if (id) void removeHighlight(id); }}>
										<Icon name="highlight" size={15} />{props.t("pdfRemoveHighlight")}
									</Button>
									<Button class={styles.contextMenuButton} type="button" disabled={highlightSaving()} onClick={() => setTextMenu(current => current ? { ...current, mode: "actions" } : current)}>
										{props.t("cancel")}
									</Button>
									<Button class={styles.contextMenuButton} type="button" disabled={highlightSaving()} onClick={() => { const id = menu().highlightId; if (id) void saveHighlightEdit(id); }}>
										<Icon name="check" size={15} />{props.t("save")}
									</Button>
								</div>
							</>
						}>
							<Button class={styles.contextMenuButton} type="button" onClick={() => copyMenuText(menu())}>
								<Icon name="copy" size={15} />{props.t("aiSelectionCopy")}
							</Button>
							<Show when={!menu().highlightId}>
								<Button
									class={styles.contextMenuButton}
									type="button"
									disabled={highlightSaving() || !menu().selection}
									onClick={() => void saveSelectionAsHighlight()}
								>
									<Icon name="highlight" size={15} />
									{props.t("pdfHighlightSelection")}
								</Button>
							</Show>
							<Show when={menu().highlightId}>
								<Button class={styles.contextMenuButton} type="button" onClick={() => beginEditHighlight(menu().highlightId!)}>
									<Icon name="edit" size={15} />{props.t("pdfEditHighlight")}
								</Button>
							</Show>
							<Button class={styles.contextMenuButton} type="button" onClick={() => searchMenuText(menu())}>
								<Icon name="search" size={15} />{props.t("pdfSearch")}
							</Button>
						</Show>
					</div>
				}</Show>
				<Show when={textMenu()?.mode === "edit" && noteLinkSuggestions.open()}>
					<NoteLinkSuggestions
						id={noteSuggestionsId}
						anchor={suggestionAnchor()}
						notes={noteLinkSuggestions.suggestions()}
						selectedIndex={noteLinkSuggestions.selectedIndex()}
						t={props.t}
						onSelect={noteLinkSuggestions.select}
					/>
				</Show>
				<Show when={busy()}><div class={styles.readerStatus}>{props.t("pdfLoading")}</div></Show>
				<Show when={renderFailed()}><div class={styles.readerStatus}>{props.t("pdfRenderFailed")}</div></Show>
				</div>
				<CustomScrollbars scroll={scroll} />
			</div>
		</>
	);
};

export default PdfReader;
