import { createEffect, createMemo, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type Component } from "solid-js";
import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { displayNoteTitle, NOTE_TITLE_MAX_LENGTH, type NoteSummary } from "@/entities/note";
import { NoteLinkSuggestions, useNoteLinkSuggestions } from "@/features/suggest-note-link";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { openUrl } from "@/shared/lib/desktop";
import { CustomScrollbars, useCustomScrollArea } from "@/shared/ui/custom-scroll-area";
import { addPdfHighlight, deletePdfHighlight, getPdfDocumentStreamUrl, maxPdfHighlightRects, maxPdfHighlightTextLength, pdfHighlightColors, readPdfHighlights, updatePdfHighlight, type PdfDocument, type PdfHighlight, type PdfHighlightColor, type PdfHighlightRect } from "../api/pdfs.repository";
import { getPdfAdjacentPreviewPages, getPdfPageNavigationTarget, getPdfPageSpreadPages, normalizePdfPageSpreadCursor, pdfPageSpreadGap, shouldUsePdfPageSpread } from "../model/page-spread";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "./pdf-panel/style.css.ts";

GlobalWorkerOptions.workerSrc = workerUrl;

const pdfReaderResizeDebounceMs = 50;

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

type PdfTextMenu = {
	text: string;
	selection?: { text: string; rects: PdfHighlightRect[] };
	highlightId?: string;
	page: number;
	x: number;
	y: number;
	mode: "actions" | "edit";
};

type SuggestionAnchor = { left: number; top: number; height: number };
type PdfPageRenderConfig = { viewport: ReturnType<PDFPageProxy["getViewport"]>; outputScale: number };
type CachedPdfPagePreview = {
	signature: string;
	bitmap: ImageBitmap;
	width: number;
	height: number;
};
type PdfZoomAnchor = { page: number; x: number; y: number; clientX: number; clientY: number };

const getPdfPageRenderConfig = (page: PDFPageProxy, width: number, height: number, scaleFactor: number, spreadEnabled: boolean): PdfPageRenderConfig => {
	const baseViewport = page.getViewport({ scale: 1 });
	const horizontalFrameSpace = 28 + (spreadEnabled ? pdfPageSpreadGap + 4 : 2);
	const availableWidth = Math.max(1, width - horizontalFrameSpace);
	const pageWidth = spreadEnabled ? availableWidth / 2 : availableWidth;
	const fitScale = Math.min(pageWidth / baseViewport.width, Math.max(1, height - 30) / baseViewport.height);
	const displayScale = Math.max(0.1, fitScale * scaleFactor);
	return {
		viewport: page.getViewport({ scale: displayScale }),
		outputScale: Math.min(window.devicePixelRatio || 1, 2),
	};
};

const getPdfPagePreviewBaseSignature = (width: number, height: number, scaleFactor: number): string =>
	`${width}:${height}:${scaleFactor}:${Math.min(window.devicePixelRatio || 1, 2)}`;

const getPdfPagePreviewSignature = (width: number, height: number, scaleFactor: number, twoPageLayout: boolean): string =>
	`${getPdfPagePreviewBaseSignature(width, height, scaleFactor)}:${twoPageLayout}`;

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
	const [textMenu, setTextMenu] = createSignal<PdfTextMenu>();
	const [pageJumpOpen, setPageJumpOpen] = createSignal(false);
	const [pageJumpValue, setPageJumpValue] = createSignal("");
	const [editColor, setEditColor] = createSignal<PdfHighlightColor>("yellow");
	const [editNoteId, setEditNoteId] = createSignal("");
	const [editNoteQuery, setEditNoteQuery] = createSignal("");
	const [noteSuggestionCaret, setNoteSuggestionCaret] = createSignal<number>();
	const [suggestionAnchor, setSuggestionAnchor] = createSignal<SuggestionAnchor>({ left: 0, top: 0, height: 32 });
	const [textLayerReadyPages, setTextLayerReadyPages] = createSignal<Set<number>>(new Set());
	const [pageElementsRevision, setPageElementsRevision] = createSignal(0);
	const [highlightError, setHighlightError] = createSignal<TranslationKey>();
	const [highlightSaving, setHighlightSaving] = createSignal(false);
	let host: HTMLDivElement | undefined;
	let notePickerInput: HTMLInputElement | undefined;
	let loadRevision = 0;
	let pagePreviewRevision = 0;
	const pagePreviewCache = new Map<number, CachedPdfPagePreview>();
	const pagePreviewTasks = new Map<number, RenderTask>();
	const pageRenderTasks = new Map<number, RenderTask>();
	const textLayerTasks = new Map<number, TextLayer>();
	const pageElements = new Map<number, { canvas?: HTMLCanvasElement; textLayer?: HTMLDivElement }>();
	let centerHorizontalScrollOnRender = false;
	let zoomAnchor: PdfZoomAnchor | undefined;
	let panPointer: { x: number; y: number } | undefined;
	const noteSuggestionsId = createUniqueId();
	const spreadEnabled = createMemo(() => shouldUsePdfPageSpread(size().width, size().height, pageAspectRatio(), pageCount()));
	const visiblePages = createMemo(() => getPdfPageSpreadPages(pageNumber(), pageCount(), spreadEnabled()));
	const progressPage = createMemo(() => {
		const pages = visiblePages();
		return pages[pages.length - 1] ?? pageNumber();
	});
	createEffect(on(spreadEnabled, enabled => {
		if (enabled) setPageNumber(current => normalizePdfPageSpreadCursor(current, pageCount(), true));
	}));
	const registerPageElement = (page: number, key: "canvas" | "textLayer", element: HTMLCanvasElement | HTMLDivElement) => {
		const current = pageElements.get(page) ?? {};
		pageElements.set(page, { ...current, [key]: element });
		if (visiblePages().every(visiblePage => {
			const elements = pageElements.get(visiblePage);
			return elements?.canvas && elements.textLayer;
		})) setPageElementsRevision(revision => revision + 1);
	};
	const cancelPageRenderTasks = () => {
		for (const task of pageRenderTasks.values()) task.cancel();
		pageRenderTasks.clear();
		for (const task of textLayerTasks.values()) task.cancel();
		textLayerTasks.clear();
	};
	const cancelPagePreviewTasks = () => {
		pagePreviewRevision += 1;
		for (const task of pagePreviewTasks.values()) task.cancel();
		pagePreviewTasks.clear();
	};
	const clearPagePreviewCache = () => {
		for (const preview of pagePreviewCache.values()) preview.bitmap.close();
		pagePreviewCache.clear();
	};
	const prunePagePreviewCache = (expectedSignatures: Map<number, string>) => {
		for (const [page, preview] of pagePreviewCache) {
			if (expectedSignatures.get(page) === preview.signature) continue;
			preview.bitmap.close();
			pagePreviewCache.delete(page);
		}
	};
	const preloadAdjacentPages = async (
		document: PDFDocumentProxy,
		pages: number[],
		pageCount: number,
		width: number,
		height: number,
		scaleFactor: number,
		spread: boolean,
	) => {
		const revision = pagePreviewRevision;
		const candidates = getPdfAdjacentPreviewPages(
			pages[0] ?? pageNumber(),
			pages,
			Math.min(pageCount, document.numPages),
			spread,
		);
		const expectedSignatures = new Map(candidates.map(candidate => {
			const twoPageLayout = getPdfPageSpreadPages(candidate, pageCount, spread).length > 1;
			return [candidate, getPdfPagePreviewSignature(width, height, scaleFactor, twoPageLayout)];
		}));
		prunePagePreviewCache(expectedSignatures);
		for (const candidate of candidates) {
			if (revision !== pagePreviewRevision) return;
			const signature = expectedSignatures.get(candidate)!;
			if (pagePreviewCache.get(candidate)?.signature === signature) continue;
			const previewCanvas = window.document.createElement("canvas");
			let task: RenderTask | undefined;
			try {
				const previewPage = await document.getPage(candidate);
				if (revision !== pagePreviewRevision) return;
				const twoPageLayout = getPdfPageSpreadPages(candidate, pageCount, spread).length > 1;
				const config = getPdfPageRenderConfig(previewPage, width, height, scaleFactor, twoPageLayout);
				const { viewport, outputScale } = config;
				previewCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
				previewCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
				const context = previewCanvas.getContext("2d", { alpha: false });
				if (!context) continue;
				task = previewPage.render({
					canvas: previewCanvas,
					canvasContext: context,
					viewport,
					transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
					background: "#fff",
				});
				pagePreviewTasks.set(candidate, task);
				await task.promise;
				if (revision !== pagePreviewRevision) return;
				const bitmap = await createImageBitmap(previewCanvas);
				if (revision !== pagePreviewRevision) {
					bitmap.close();
					return;
				}
				pagePreviewCache.set(candidate, {
					signature,
					bitmap,
					width: Math.floor(viewport.width),
					height: Math.floor(viewport.height),
				});
			} catch {
				// A failed background preview should not interrupt normal page rendering.
			} finally {
				if (task && pagePreviewTasks.get(candidate) === task) pagePreviewTasks.delete(candidate);
				previewCanvas.width = 0;
				previewCanvas.height = 0;
			}
		}
	};
	const restoreZoomPosition = () => {
		const anchor = zoomAnchor;
		zoomAnchor = undefined;
		if (anchor && host) {
			const bounds = pageElements.get(anchor.page)?.canvas?.getBoundingClientRect();
			if (bounds) {
				host.scrollLeft += bounds.left + anchor.x * bounds.width - anchor.clientX;
				host.scrollTop += bounds.top + anchor.y * bounds.height - anchor.clientY;
				return;
			}
		}
		if (centerHorizontalScrollOnRender && host) {
			host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
			centerHorizontalScrollOnRender = false;
		}
	};
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
	const updateSuggestionAnchor = () => {
		if (!notePickerInput?.isConnected) return;
		const bounds = notePickerInput.getBoundingClientRect();
		setSuggestionAnchor({ left: bounds.left + bounds.width / 2, top: bounds.top, height: bounds.height });
	};
	createEffect(() => {
		if (!noteLinkSuggestions.open()) return;
		let frame: number | undefined;
		const update = () => updateSuggestionAnchor();
		const schedule = () => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("resize", schedule);
		host?.addEventListener("scroll", schedule);
		onCleanup(() => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			window.removeEventListener("resize", schedule);
			host?.removeEventListener("scroll", schedule);
		});
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
		zoomAnchor = undefined;
		centerHorizontalScrollOnRender = false;
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
		if (!host) return;
		let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
		let hasInitialSize = false;
		const observer = new ResizeObserver(entries => {
			const box = entries[0]?.contentRect;
			if (!box) return;
			const nextSize = { width: box.width, height: box.height };
			if (!hasInitialSize) {
				hasInitialSize = true;
				setSize(nextSize);
				return;
			}
			if (resizeTimeout !== undefined) clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				resizeTimeout = undefined;
				setSize(nextSize);
			}, pdfReaderResizeDebounceMs);
		});
		observer.observe(host);
		onCleanup(() => {
			observer.disconnect();
			if (resizeTimeout !== undefined) clearTimeout(resizeTimeout);
		});
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
		const elements = pages.map(page => pageElements.get(page));
		if (elements.some(pageElements => !pageElements?.canvas || !pageElements.textLayer)) return;
		let cancelled = false;
		const baseSignature = getPdfPagePreviewBaseSignature(width, height, scaleFactor);
		const expectedSignatures = new Map(pages.map(page => [
			page,
			getPdfPagePreviewSignature(width, height, scaleFactor, pages.length > 1),
		]));
		const visiblePreviews = new Map(pages.map(page => [page, pagePreviewCache.get(page)]));
		for (const [cachedPage, preview] of pagePreviewCache) {
			if (preview.signature.startsWith(`${baseSignature}:`)) continue;
			preview.bitmap.close();
			pagePreviewCache.delete(cachedPage);
			visiblePreviews.delete(cachedPage);
		}
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
			try {
				const renderPage = async (page: number) => {
					if (cancelled) return;
					const pageNodes = pageElements.get(page)!;
					const pageCanvas = pageNodes.canvas!;
					const textLayerContainer = pageNodes.textLayer!;
					const pdfPage = await document.getPage(page);
					if (cancelled) return;
					const twoPageLayout = pages.length > 1;
					const { viewport, outputScale } = getPdfPageRenderConfig(pdfPage, width, height, scaleFactor, twoPageLayout);
					const cachedPreview = visiblePreviews.get(page)?.signature === expectedSignatures.get(page) ? visiblePreviews.get(page) : undefined;
					if (cachedPreview) {
						pageCanvas.width = cachedPreview.bitmap.width;
						pageCanvas.height = cachedPreview.bitmap.height;
						pageCanvas.style.width = `${cachedPreview.width}px`;
						pageCanvas.style.height = `${cachedPreview.height}px`;
					} else {
						pageCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
						pageCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
						pageCanvas.style.width = `${Math.floor(viewport.width)}px`;
						pageCanvas.style.height = `${Math.floor(viewport.height)}px`;
					}
					const context = pageCanvas.getContext("2d");
					if (!context) throw Error("PDF_CANVAS_UNAVAILABLE");
					if (cachedPreview) context.drawImage(cachedPreview.bitmap, 0, 0);

					const renderPromise = cachedPreview ? Promise.resolve() : (async () => {
						const task = pdfPage.render({
							canvas: pageCanvas,
							canvasContext: context,
							viewport,
							transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
							background: "#fff",
						});
						pageRenderTasks.set(page, task);
						try {
							await task.promise;
						} finally {
							if (pageRenderTasks.get(page) === task) pageRenderTasks.delete(page);
						}
					})();
					let currentTextLayerTask: TextLayer | undefined;
					const textLayerPromise = (async () => {
						try {
							const textContent = await pdfPage.getTextContent();
							if (cancelled) return;
							textLayerContainer.style.setProperty("--scale-factor", String(viewport.scale));
							textLayerContainer.style.setProperty("--user-unit", String(viewport.userUnit));
							currentTextLayerTask = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
							textLayerTasks.set(page, currentTextLayerTask);
							await currentTextLayerTask.render();
							if (!cancelled) setTextLayerReadyPages(current => new Set(current).add(page));
						} catch {
							if (!cancelled) setHighlightError("pdfTextLayerFailed");
						} finally {
							if (textLayerTasks.get(page) === currentTextLayerTask) textLayerTasks.delete(page);
						}
					})();
					await Promise.all([renderPromise, textLayerPromise]);
				};
				const results = await Promise.allSettled(pages.map(renderPage));
				if (cancelled) return;
				const failedPage = results.find(result => result.status === "rejected");
				if (failedPage?.status === "rejected") throw failedPage.reason;
				restoreZoomPosition();
				setBusy(false);
				props.onProgress(props.document.id, progressPage(), document.numPages);
				void preloadAdjacentPages(document, pages, document.numPages, width, height, scaleFactor, spread);
			} catch (error) {
				if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
					setBusy(false);
					setRenderFailed(true);
				}
			}
		})();
		onCleanup(() => {
			cancelled = true;
			cancelPageRenderTasks();
			cancelPagePreviewTasks();
		});
	}));

	type ClientRectBounds = { left: number; top: number; right: number; bottom: number };
	const getSelectionData = (textLayerContainer: HTMLDivElement): { text: string; rects: PdfHighlightRect[] } | undefined => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount) return undefined;
		const range = selection.getRangeAt(0);
		if (!textLayerContainer.contains(range.startContainer) || !textLayerContainer.contains(range.endContainer)) return undefined;
		const text = selection.toString().trim();
		if (!text || Array.from(text).length > maxPdfHighlightTextLength) return undefined;
		const bounds = textLayerContainer.getBoundingClientRect();
		if (bounds.width < 1 || bounds.height < 1) return undefined;
		const clientRects = Array.from(range.getClientRects())
			.filter(rect => rect.width > 0 && rect.height > 0)
			.map(rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }))
			.sort((left, right) => left.top - right.top || left.left - right.left);
		const merged: ClientRectBounds[] = [];
		for (const rect of clientRects) {
			let line: ClientRectBounds | undefined;
			for (let index = merged.length - 1; index >= 0; index -= 1) {
				const candidate = merged[index];
				const candidateHeight = candidate.bottom - candidate.top;
				const rectHeight = rect.bottom - rect.top;
				const sameLine = Math.abs((candidate.top + candidate.bottom) / 2 - (rect.top + rect.bottom) / 2)
					<= Math.max(2, Math.min(candidateHeight, rectHeight) * 0.4);
				const closeEnough = rect.left <= candidate.right + Math.max(3, rectHeight * 0.75)
					&& rect.right >= candidate.left - Math.max(3, rectHeight * 0.75);
				if (sameLine && closeEnough) { line = candidate; break; }
			}
			if (line) {
				line.left = Math.min(line.left, rect.left);
				line.top = Math.min(line.top, rect.top);
				line.right = Math.max(line.right, rect.right);
				line.bottom = Math.max(line.bottom, rect.bottom);
			} else merged.push({ ...rect });
		}
		if (!merged.length || merged.length > maxPdfHighlightRects) return undefined;
		const rects = merged.map(rect => {
			const left = Math.max(bounds.left, Math.min(bounds.right, rect.left));
			const top = Math.max(bounds.top, Math.min(bounds.bottom, rect.top));
			const right = Math.max(left, Math.min(bounds.right, rect.right));
			const bottom = Math.max(top, Math.min(bounds.bottom, rect.bottom));
			return {
				x: (left - bounds.left) / bounds.width,
				y: (top - bounds.top) / bounds.height,
				width: (right - left) / bounds.width,
				height: (bottom - top) / bounds.height,
			};
		}).filter(rect => rect.width > 0 && rect.height > 0);
		return rects.length ? { text, rects } : undefined;
	};
	const getHighlightAt = (page: number, textLayerContainer: HTMLDivElement, clientX: number, clientY: number): PdfHighlight | undefined => {
		const bounds = textLayerContainer.getBoundingClientRect();
		if (bounds.width < 1 || bounds.height < 1) return;
		const x = (clientX - bounds.left) / bounds.width;
		const y = (clientY - bounds.top) / bounds.height;
		return highlights().find(highlight => highlight.page === page
			&& highlight.rects.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
	};
	const openSelectionMenu = (page: number, textLayerContainer: HTMLDivElement, event: MouseEvent) => {
		const selection = getSelectionData(textLayerContainer);
		const existingHighlight = getHighlightAt(page, textLayerContainer, event.clientX, event.clientY);
		if (!host || (!selection && !existingHighlight)) return;
		event.preventDefault();
		event.stopPropagation();
		const bounds = host.getBoundingClientRect();
		const menuWidth = 208;
		const menuHeight = existingHighlight ? 152 : 116;
		setSelectedHighlightId(existingHighlight?.id);
		setTextMenu({
			text: selection?.text ?? existingHighlight!.text,
			selection: existingHighlight ? undefined : selection,
			highlightId: existingHighlight?.id,
			page,
			x: Math.max(host.scrollLeft + 8, Math.min(event.clientX - bounds.left + host.scrollLeft, host.scrollLeft + host.clientWidth - menuWidth - 8)),
			y: Math.max(host.scrollTop + 8, Math.min(event.clientY - bounds.top + host.scrollTop, host.scrollTop + host.clientHeight - menuHeight - 8)),
			mode: "actions",
		});
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
		const highlight = getHighlightAt(page, textLayerContainer, event.clientX, event.clientY);
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
		const outside = (event: PointerEvent) => {
			if (!(event.target instanceof Element)
				|| (!event.target.closest(`.${styles.contextMenu}`) && !event.target.closest('[role="listbox"]'))) setTextMenu(undefined);
		};
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (event.target === notePickerInput && noteLinkSuggestions.open()) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setTextMenu(undefined);
		};
		window.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", escape, true);
		onCleanup(() => {
			window.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", escape, true);
		});
	});
	const saveSelectionAsHighlight = async () => {
		const vaultId = props.vaultId;
		const menu = textMenu();
		const selected = menu?.selection;
		if (!vaultId || !menu || !selected || !textLayerReadyPages().has(menu.page) || highlightSaving()) return;
		const documentId = props.document.id;
		const revision = loadRevision;
		const highlight: PdfHighlight = { id: crypto.randomUUID(), page: menu.page, ...selected, color: "yellow", noteId: null };
		setHighlightSaving(true);
		setHighlightError(undefined);
		try {
			const saved = await addPdfHighlight(vaultId, documentId, highlight);
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) {
				setHighlights(saved);
				setSelectedHighlightId(highlight.id);
				setTextMenu(undefined);
				window.getSelection()?.removeAllRanges();
			}
		} catch {
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) setHighlightError("pdfHighlightSaveFailed");
		} finally {
			if (revision === loadRevision) setHighlightSaving(false);
		}
	};
	const saveHighlightEdit = async (highlightId: string) => {
		const vaultId = props.vaultId;
		const highlight = highlights().find(item => item.id === highlightId);
		if (!vaultId || !highlight || highlightSaving()) return;
		const documentId = props.document.id;
		const revision = loadRevision;
		const updated = { ...highlight, color: editColor(), noteId: editNoteId() || null };
		setHighlightSaving(true);
		setHighlightError(undefined);
		try {
			const saved = await updatePdfHighlight(vaultId, documentId, updated);
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) {
				setHighlights(saved);
				setSelectedHighlightId(highlightId);
				setTextMenu(undefined);
			}
		} catch {
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) setHighlightError("pdfHighlightUpdateFailed");
		} finally {
			if (revision === loadRevision) setHighlightSaving(false);
		}
	};
	const removeHighlight = async (highlightId: string) => {
		const vaultId = props.vaultId;
		if (!vaultId || highlightSaving()) return;
		const documentId = props.document.id;
		const revision = loadRevision;
		setHighlightSaving(true);
		setHighlightError(undefined);
		try {
			const saved = await deletePdfHighlight(vaultId, documentId, highlightId);
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) {
				setHighlights(saved);
				setSelectedHighlightId(undefined);
				setTextMenu(undefined);
			}
		} catch {
			if (revision === loadRevision && props.vaultId === vaultId && props.document.id === documentId) setHighlightError("pdfHighlightDeleteFailed");
		} finally {
			if (revision === loadRevision) setHighlightSaving(false);
		}
	};
	const copyMenuText = (menu: PdfTextMenu) => {
		void navigator.clipboard.writeText(menu.text).catch(console.error);
		setTextMenu(undefined);
	};
	const searchMenuText = (menu: PdfTextMenu) => {
		void openUrl(`https://www.google.com/search?q=${encodeURIComponent(menu.text)}`).catch(console.error);
		setTextMenu(undefined);
	};

	const movePage = (direction: -1 | 1) => {
		zoomAnchor = undefined;
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		window.getSelection()?.removeAllRanges();
		setPageNumber(current => getPdfPageNavigationTarget(current, pageCount(), spreadEnabled(), direction));
	};
	const openPageJump = () => {
		if (!pageCount() || busy()) return;
		setPageJumpValue(String(visiblePages()[0] ?? pageNumber()));
		setPageJumpOpen(true);
	};
	const goToPage = () => {
		if (!pageJumpOpen()) return;
		const target = Number(pageJumpValue());
		setPageJumpOpen(false);
		if (!Number.isInteger(target) || target < 1 || target > pageCount()) return;
		zoomAnchor = undefined;
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		window.getSelection()?.removeAllRanges();
		setPageNumber(target);
	};
	const getPdfZoomAnchor = (event: WheelEvent): PdfZoomAnchor | undefined => {
		for (const [page, elements] of pageElements) {
			const bounds = elements.canvas?.getBoundingClientRect();
			if (!bounds || bounds.width < 1 || bounds.height < 1
				|| event.clientX < bounds.left || event.clientX > bounds.right
				|| event.clientY < bounds.top || event.clientY > bounds.bottom) continue;
			return {
				page,
				x: (event.clientX - bounds.left) / bounds.width,
				y: (event.clientY - bounds.top) / bounds.height,
				clientX: event.clientX,
				clientY: event.clientY,
			};
		}
	};
	const changeZoom = (delta: number, anchor?: PdfZoomAnchor) => {
		const current = zoom();
		const next = Math.max(0.5, Math.min(2, Math.round((current + delta) * 10) / 10));
		if (next === current) return;
		zoomAnchor = anchor;
		centerHorizontalScrollOnRender = !anchor;
		setZoom(next);
	};
	const handlePdfWheel = (event: WheelEvent) => {
		if (!event.ctrlKey) return;
		event.preventDefault();
		if (!pageCount() || event.deltaY === 0) return;
		changeZoom(event.deltaY < 0 ? 0.1 : -0.1, getPdfZoomAnchor(event));
	};
	const movePan = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
		if (event.pointerType !== "mouse" || document.pointerLockElement === event.currentTarget) return;
		const previous = panPointer;
		panPointer = { x: event.clientX, y: event.clientY };
		const active = event.altKey && event.buttons === 0
			&& !(event.target instanceof Element && event.target.closest(`.${styles.contextMenu}`));
		setPanning(active);
		if (!active || !previous) return;
		event.currentTarget.scrollLeft += event.clientX - previous.x;
		event.currentTarget.scrollTop += event.clientY - previous.y;
	};
	const moveLockedPan = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
		if (!event.altKey || document.pointerLockElement !== event.currentTarget) return;
		event.currentTarget.scrollLeft += event.movementX;
		event.currentTarget.scrollTop += event.movementY;
	};
	const finishPan = () => {
		panPointer = undefined;
		setPanning(false);
	};
	onMount(() => {
		const viewport = host;
		if (!viewport) return;
		let altHeld = false;
		const unlock = () => {
			if (document.pointerLockElement === viewport) document.exitPointerLock();
		};
		const stopLockedPan = () => {
			altHeld = false;
			unlock();
			finishPan();
		};
		const onPointerLockChange = () => {
			panPointer = undefined;
			if (!altHeld) unlock();
		};
		const pressAlt = (event: KeyboardEvent) => {
			if (event.key !== "Alt" || event.repeat || !viewport.matches(":hover")) return;
			altHeld = true;
			setPanning(true);
			if (document.pointerLockElement || !viewport.requestPointerLock) return;
			try {
				const request = viewport.requestPointerLock();
				void request?.then(() => { if (!altHeld) unlock(); }).catch(() => {});
			} catch {
				// Keep the existing hover scrolling if pointer lock is unavailable.
			}
		};
		const releaseAlt = (event: KeyboardEvent) => {
			if (!event.altKey) stopLockedPan();
		};
		window.addEventListener("keydown", pressAlt, true);
		window.addEventListener("keyup", releaseAlt, true);
		window.addEventListener("blur", stopLockedPan);
		document.addEventListener("pointerlockchange", onPointerLockChange);
		onCleanup(() => {
			window.removeEventListener("keydown", pressAlt, true);
			window.removeEventListener("keyup", releaseAlt, true);
			window.removeEventListener("blur", stopLockedPan);
			document.removeEventListener("pointerlockchange", onPointerLockChange);
			stopLockedPan();
		});
	});
	const ReaderToolbar = () => (
		<div class={styles.readerToolbar}>
			<Button class={styles.iconButton} type="button" disabled={(visiblePages()[0] ?? pageNumber()) <= 1 || busy()} onClick={() => movePage(-1)}><Icon name="back" size={15} /></Button>
			<Show when={pageJumpOpen()} fallback={
				<Button class={styles.pageJumpButton} type="button" disabled={!pageCount() || busy()} onClick={openPageJump}>
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
					onInput={event => setPageJumpValue(event.currentTarget.value)}
					onBlur={goToPage}
					onKeyDown={event => {
						if (event.key === "Enter") {
							event.preventDefault();
							goToPage();
						} else if (event.key === "Escape") {
							event.preventDefault();
							setPageJumpOpen(false);
						}
					}}
				/>
			</Show>
			<Button class={styles.iconButton} type="button" disabled={!pageCount() || progressPage() >= pageCount() || busy()} onClick={() => movePage(1)}><Icon name="chevronRight" size={15} /></Button>
			<span style={{ width: "8px" }} />
			<Button class={styles.iconButton} type="button" disabled={zoom() <= 0.5} onClick={() => changeZoom(-0.1)}><Icon name="zoomOut" size={15} /></Button>
			<span class={styles.pageLabel}>{Math.round(zoom() * 100)}%</span>
			<Button class={styles.iconButton} type="button" disabled={zoom() >= 2} onClick={() => changeZoom(0.1)}><Icon name="zoomIn" size={15} /></Button>
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
					onPointerEnter={movePan}
					onPointerMove={movePan}
					onMouseMove={moveLockedPan}
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
											updateSuggestionAnchor();
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
							<Button
								class={styles.contextMenuButton}
								type="button"
								disabled={highlightSaving() || (!menu().selection && !menu().highlightId)}
								onClick={() => { const id = menu().highlightId; if (id) void removeHighlight(id); else void saveSelectionAsHighlight(); }}
							>
								<Icon name="highlight" size={15} />
								{props.t(menu().highlightId ? "pdfRemoveHighlight" : "pdfHighlightSelection")}
							</Button>
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
