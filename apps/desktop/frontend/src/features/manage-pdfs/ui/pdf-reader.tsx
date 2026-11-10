import { createEffect, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type Component } from "solid-js";
import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { displayNoteTitle, NOTE_TITLE_MAX_LENGTH, type NoteSummary } from "@/entities/note";
import { NoteLinkSuggestions, useNoteLinkSuggestions } from "@/features/suggest-note-link";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { openUrl } from "@/shared/lib/desktop";
import { CustomScrollbars, useCustomScrollArea } from "@/shared/ui/custom-scroll-area";
import { addPdfHighlight, deletePdfHighlight, getPdfDocumentStreamUrl, maxPdfHighlightRects, maxPdfHighlightTextLength, pdfHighlightColors, readPdfHighlights, updatePdfHighlight, type PdfDocument, type PdfHighlight, type PdfHighlightColor, type PdfHighlightRect } from "../api/pdfs.repository";
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
	const [zoom, setZoom] = createSignal(1);
	const [busy, setBusy] = createSignal(true);
	const [renderFailed, setRenderFailed] = createSignal(false);
	const [size, setSize] = createSignal({ width: 0, height: 0 });
	const [highlights, setHighlights] = createSignal<PdfHighlight[]>([]);
	const [selectedHighlightId, setSelectedHighlightId] = createSignal<string>();
	const [textMenu, setTextMenu] = createSignal<PdfTextMenu>();
	const [editColor, setEditColor] = createSignal<PdfHighlightColor>("yellow");
	const [editNoteId, setEditNoteId] = createSignal("");
	const [editNoteQuery, setEditNoteQuery] = createSignal("");
	const [noteSuggestionCaret, setNoteSuggestionCaret] = createSignal<number>();
	const [suggestionAnchor, setSuggestionAnchor] = createSignal<SuggestionAnchor>({ left: 0, top: 0, height: 32 });
	const [textLayerReady, setTextLayerReady] = createSignal(false);
	const [highlightError, setHighlightError] = createSignal<TranslationKey>();
	const [highlightSaving, setHighlightSaving] = createSignal(false);
	let host: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let textLayerContainer: HTMLDivElement | undefined;
	let notePickerInput: HTMLInputElement | undefined;
	let renderTask: RenderTask | undefined;
	let textLayerTask: TextLayer | undefined;
	let loadRevision = 0;
	let centerHorizontalScrollOnRender = false;
	const noteSuggestionsId = createUniqueId();
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
		setBusy(true);
		setRenderFailed(false);
		setHighlights([]);
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		setTextLayerReady(false);
		setHighlightError(undefined);
		setHighlightSaving(false);
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
			renderTask?.cancel();
			if (loadingTask) void loadingTask.destroy();
		});
	}));

	onMount(() => {
		if (!host) return;
		const observer = new ResizeObserver(entries => {
			const box = entries[0]?.contentRect;
			if (box) setSize({ width: box.width, height: box.height });
		});
		observer.observe(host);
		onCleanup(() => observer.disconnect());
	});

	createEffect(on(() => [pdf(), pageNumber(), zoom(), size().width, size().height] as const, ([document, page, scaleFactor, width, height]) => {
		if (!document || !canvas || !textLayerContainer || width < 1 || height < 1) return;
		let cancelled = false;
		let task: RenderTask | undefined;
		let currentTextLayer: TextLayer | undefined;
		renderTask?.cancel();
		textLayerTask?.cancel();
		textLayerTask = undefined;
		textLayerContainer.replaceChildren();
		setTextLayerReady(false);
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		window.getSelection()?.removeAllRanges();
		setBusy(true);
		setRenderFailed(false);
		void (async () => {
			try {
				const pdfPage = await document.getPage(page);
				if (cancelled || !canvas) return;
				const baseViewport = pdfPage.getViewport({ scale: 1 });
				const fitScale = Math.min((width - 28) / baseViewport.width, (height - 28) / baseViewport.height);
				const displayScale = Math.max(0.1, fitScale * scaleFactor);
				const outputScale = Math.min(window.devicePixelRatio || 1, 2);
				const viewport = pdfPage.getViewport({ scale: displayScale });
				canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
				canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
				canvas.style.width = `${Math.floor(viewport.width)}px`;
				canvas.style.height = `${Math.floor(viewport.height)}px`;
				if (centerHorizontalScrollOnRender && host) {
					host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
					centerHorizontalScrollOnRender = false;
				}
				const context = canvas.getContext("2d");
				if (!context) throw Error("PDF_CANVAS_UNAVAILABLE");
				const textLayerPromise = (async () => {
					try {
						const textContent = await pdfPage.getTextContent();
						if (cancelled || !textLayerContainer) return;
						textLayerContainer.style.setProperty("--scale-factor", String(viewport.scale));
						textLayerContainer.style.setProperty("--user-unit", String(viewport.userUnit));
						currentTextLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
						textLayerTask = currentTextLayer;
						await currentTextLayer.render();
						if (!cancelled) setTextLayerReady(true);
					} catch {
						if (!cancelled) setHighlightError("pdfTextLayerFailed");
					}
				})();
				task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0], background: "#fff" });
				renderTask = task;
				await task.promise;
				await textLayerPromise;
				if (!cancelled) {
					setBusy(false);
					props.onProgress(props.document.id, page, document.numPages);
				}
			} catch (error) {
				if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
					setBusy(false);
					setRenderFailed(true);
				}
			}
		})();
		onCleanup(() => {
			cancelled = true;
			task?.cancel();
			currentTextLayer?.cancel();
			if (renderTask === task) renderTask = undefined;
			if (textLayerTask === currentTextLayer) textLayerTask = undefined;
		});
	}));

	type ClientRectBounds = { left: number; top: number; right: number; bottom: number };
	const getSelectionData = (): { text: string; rects: PdfHighlightRect[] } | undefined => {
		if (!textLayerContainer) return undefined;
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
	const getHighlightAt = (clientX: number, clientY: number): PdfHighlight | undefined => {
		if (!textLayerContainer) return;
		const bounds = textLayerContainer.getBoundingClientRect();
		if (bounds.width < 1 || bounds.height < 1) return;
		const x = (clientX - bounds.left) / bounds.width;
		const y = (clientY - bounds.top) / bounds.height;
		return highlights().find(highlight => highlight.page === pageNumber()
			&& highlight.rects.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
	};
	const openSelectionMenu = (event: MouseEvent) => {
		const selection = getSelectionData();
		const existingHighlight = getHighlightAt(event.clientX, event.clientY);
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
			page: pageNumber(),
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
	const openLinkedHighlight = (event: MouseEvent) => {
		const highlight = getHighlightAt(event.clientX, event.clientY);
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
		if (!vaultId || !menu || !selected || !textLayerReady() || highlightSaving()) return;
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

	const movePage = (delta: number) => {
		setSelectedHighlightId(undefined);
		setTextMenu(undefined);
		window.getSelection()?.removeAllRanges();
		setPageNumber(current => Math.max(1, Math.min(pageCount(), current + delta)));
	};
	const changeZoom = (delta: number) => setZoom(current => {
		const next = Math.max(0.5, Math.min(2, Math.round((current + delta) * 10) / 10));
		if (next !== current) centerHorizontalScrollOnRender = true;
		return next;
	});

	return (
		<>
			<div class={styles.header}>
				<Button class={styles.iconButton} type="button" onClick={props.onBack}><Icon name="back" size={16} /></Button>
				<h2 class={styles.headerTitle}>{props.document.title}</h2>
				<Button class={styles.iconButton} type="button" onClick={props.onClose}><Icon name="close" size={16} /></Button>
			</div>
			<div class={styles.readerToolbar}>
				<Button class={styles.iconButton} type="button" disabled={pageNumber() <= 1 || busy()} onClick={() => movePage(-1)}><Icon name="back" size={15} /></Button>
				<span class={styles.pageLabel}>{pageCount() ? `${pageNumber()} / ${pageCount()}` : "—"}</span>
				<Button class={styles.iconButton} type="button" disabled={!pageCount() || pageNumber() >= pageCount() || busy()} onClick={() => movePage(1)}><Icon name="chevronRight" size={15} /></Button>
				<span style={{ width: "8px" }} />
				<Button class={styles.iconButton} type="button" disabled={zoom() <= 0.5} onClick={() => changeZoom(-0.1)}><Icon name="zoomOut" size={15} /></Button>
				<span class={styles.pageLabel}>{Math.round(zoom() * 100)}%</span>
				<Button class={styles.iconButton} type="button" disabled={zoom() >= 2} onClick={() => changeZoom(0.1)}><Icon name="zoomIn" size={15} /></Button>
			</div>
			<Show when={highlightError()}>{key => <p class={styles.highlightError}>{props.t(key())}</p>}</Show>
			<div class={styles.readerScrollRoot} ref={scroll.setRoot}
				onPointerMove={scroll.moveThumb}
				onPointerUp={scroll.finishDrag}
				onPointerCancel={scroll.finishDrag}
				onLostPointerCapture={scroll.finishDrag}
			>
				<div class={styles.readerSurface} ref={element => { host = element; scroll.setViewport(element); }} data-omega-scroll-viewport="" onScroll={scroll.updateMetrics}>
				<div class={styles.pageFrame} ref={scroll.setContent}>
					<canvas class={styles.canvas} ref={canvas} />
					<div class={styles.highlightLayer}>
						<For each={highlights().filter(highlight => highlight.page === pageNumber())}>{highlight =>
							<For each={highlight.rects}>{rect =>
								<div
									class={`${styles.highlightMark} ${selectedHighlightId() === highlight.id ? styles.highlightMarkSelected : ""}`}
									style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, background: selectedHighlightId() === highlight.id ? highlightColors[highlight.color].selected : highlightColors[highlight.color].background }}
								/>
							}</For>
						}</For>
					</div>
					<div class={styles.textLayer} ref={textLayerContainer} onClick={openLinkedHighlight} onContextMenu={openSelectionMenu} />
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
