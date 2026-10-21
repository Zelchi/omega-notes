import { parseFormattedText, codeFont, type InlineTextFormat } from "@/shared/lib/formatted-text";
import type { TableBlock } from "@/features/edit-table";
import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type Accessor, type JSX } from "solid-js";
import {
	paragraphStarts, paragraphIndexAt, remapParagraphAlignments,
	type NotePositionedElement, type NoteTextElement, type NoteTextAlignment, type NoteSummary
} from "@/entities/note";
import { alignParagraphSelection, selectionAlignment, type ParagraphAlignmentHandler } from "@/features/align-text";
import type { TranslationKey } from "@/shared/lib/i18n";
import { noteLinkAtCaret, useNoteLinkSuggestions } from "@/features/suggest-note-link";
import { layoutTextFlow, type TextFlowLayout } from "../../lib/text-flow-layout";
import { layoutFormattedText } from "../../lib/formatted-text-layout";
import { EMPTY_CHARACTER, syncEditableTextDom } from "../../lib/editable-text-dom";
import { styles } from "./style.css.ts";
import { createTextHistory, type TextHistoryState } from "@/features/undo-note-edit";
import { createAsyncTextReplacement } from "@/shared/lib/async-text-replacement";
import { pastedUrl, canResolvePastedUrl, resolvePastedLink } from "@/features/paste-url-link";
import { formatSelection, indentSelection, type TextRun, type TextFormatHandler, type TextSelection, type FormattedFragment } from "@/features/format-text";

const IMAGE_TEXT_MARGIN = 15;
const LINK_BRACKET_INTERVAL = 250;
const HIGH_SURROGATE = /[\uD800-\uDBFF]/;
type CaretPlacement = (clientX: number, clientY: number) => boolean;
type CaretPosition = { node: Node; offset: number };
type CaretGeometry = { left: number; top: number; height: number };

type CaretDocument = Document & {
	caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

type TextMetrics = { font: string; lineHeight: number; letterSpacing: number };

export type NoteTextNodeProps = {
	element: Accessor<NoteTextElement>;
	notes: NoteSummary[];
	t: (key: TranslationKey) => string;
	onOpenNote: (note: NoteSummary) => void;
	onOpenExternalUrl: (url: string) => void;
	wraps: Accessor<NotePositionedElement[]>;
	onHeightChange?: (height: number) => void;
	editable: boolean;
	locked?: boolean;
	renderText: (text: string, format?: FormattedFragment, onToggleTask?: (sourceLine: number, checked: boolean) => void) => JSX.Element;
	onFormattingReady?: (handler: TextFormatHandler | undefined) => void;
	onAlignmentReady?: (handler: ParagraphAlignmentHandler | undefined) => void;
	onSelectionAlignmentChange?: (alignment: NoteTextAlignment | undefined) => void;
	onChange: (element: NoteTextElement) => void;
	onPasteImages?: (files: File[]) => void;
};

const displayText = (text: string): string => {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_match, body: string) => {
		const separator = body.indexOf("|");
		return (separator < 0 ? body : body.slice(separator + 1)).trim();
	});
};

const stripEmptyCharacter = (text: string): string => text.replaceAll(EMPTY_CHARACTER, "");

const getVisibleLength = (text: string): number => stripEmptyCharacter(text).length;

const getNativeCaretPosition = (root: HTMLElement, clientX: number, clientY: number): CaretPosition | undefined => {
	const caretDocument = document as CaretDocument;
	const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
	if (position && root.contains(position.offsetNode)) {
		return { node: position.offsetNode, offset: position.offset };
	}

	const range = caretDocument.caretRangeFromPoint?.(clientX, clientY);
	if (range && root.contains(range.startContainer)) {
		return { node: range.startContainer, offset: range.startOffset };
	}
};

const getOffsetBeforeNode = (root: HTMLElement, node: Node, offset: number): number => {
	const parent = node instanceof Element ? node : node.parentElement;
	const fragment = parent?.closest<HTMLElement>("[data-text-fragment]");
	if (fragment && root.contains(fragment)) {
		const start = Number(fragment.dataset.start);
		if (Number.isFinite(start)) {
			if (node === fragment.firstChild && node instanceof Text) {
				const value = node.textContent ?? "";
				return start + getVisibleLength(value.slice(0, offset));
			}
			const range = document.createRange();
			range.selectNodeContents(fragment);
			range.setEnd(node, offset);
			return start + getVisibleLength(range.toString());
		}
	}

	const range = document.createRange();
	range.selectNodeContents(root);
	range.setEnd(node, offset);
	return getVisibleLength(range.toString());
};

const findTextPosition = (root: HTMLElement, requestedOffset: number): { node: Text; offset: number } | undefined => {
	let lastPosition: { node: Text; offset: number } | undefined;
	for (const fragment of root.querySelectorAll<HTMLElement>("[data-text-fragment]")) {
		if (fragment.hasAttribute("data-editable-table-source")) continue;
		const start = Number(fragment.dataset.start);
		const node = fragment.firstChild;
		if (!Number.isFinite(start) || !(node instanceof Text)) continue;

		const value = node.textContent ?? "";
		const visibleLength = getVisibleLength(value);
		if (visibleLength === 0 && requestedOffset === start) return { node, offset: 0 };
		if (requestedOffset >= start && requestedOffset < start + visibleLength) {
			if (!value.includes(EMPTY_CHARACTER)) {
				return { node, offset: requestedOffset - start };
			}
			let offset = 0;
			let consumed = 0;
			while (offset < value.length && consumed < requestedOffset - start) {
				if (value[offset] !== EMPTY_CHARACTER) consumed += 1;
				offset += 1;
			}
			return { node, offset };
		}
		lastPosition = {
			node,
			offset: value.endsWith(EMPTY_CHARACTER) ? Math.max(0, value.length - 1) : value.length,
		};
	}
	return lastPosition;
};

const ensureEmptyTextPosition = (root: HTMLElement): CaretPosition | undefined => {
	const fragment = root.querySelector<HTMLElement>("[data-text-fragment]");
	if (!fragment) return undefined;

	let node = fragment.firstChild;
	if (!(node instanceof Text)) {
		node = document.createTextNode(EMPTY_CHARACTER);
		fragment.replaceChildren(node);
	} else if (!node.textContent) {
		node.textContent = EMPTY_CHARACTER;
	}

	return { node, offset: 0 };
};

export const useNoteTextNodeController = (props: NoteTextNodeProps) => {
	const history = createTextHistory();
	const [tableHeights, setTableHeights] = createSignal<Record<number, number>>({});
	let historyNoteId: string | undefined;
	let pendingHistory: TextHistoryState | undefined;
	let pendingHistoryKind = "replace";
	const [contentRoot, setContentRoot] = createSignal<HTMLDivElement>();
	const [draft, setDraft] = createSignal(props.element().text);
	const [pendingCaret, setPendingCaret] = createSignal<number>();
	const [caret, setCaret] = createSignal<CaretGeometry>();
	const [caretOffset, setCaretOffset] = createSignal<number>();
	const [measurementScale, setMeasurementScale] = createSignal(1);
	const [metrics, setMetrics] = createSignal<TextMetrics>({
		font: "400 16px sans-serif",
		lineHeight: 26.4,
		letterSpacing: 0,
	});
	const x = createMemo(() => props.element().x);
	const y = createMemo(() => props.element().y);
	const width = createMemo(() => props.element().width);
	const height = createMemo(() => props.element().height);
	const alignment = createMemo(() => props.element().alignment);
	let textSurface!: HTMLDivElement;
	let naturalTextNode: HTMLElement | undefined;
	let observedNaturalTextNode: HTMLElement | undefined;
	let measureContext: CanvasRenderingContext2D | null | undefined;
	const measureCache = new Map<string, number>();
	let composing = false;
	let lastOpeningBracket: { time: number; offset: number; selectedText?: string; expectedText?: string; paragraphAlignments?: NoteTextAlignment[] } | undefined;
	let pendingBracketDeletion: { key: string; offset: number; start: number; close: number; text: string } | undefined;
	let rememberedSelection: TextSelection | undefined;
	const urlPastes = createAsyncTextReplacement({ read: draft, apply: (text, range, kind) => {
		if (!props.editable || props.locked || composing) return;
		const root = contentRoot();
		const active = document.activeElement === root;
		const current = active ? selectionOffsets() : rememberedSelection;
		const delta = text.length - (range.end - range.start);
		const offset = (value: number) => value <= range.start ? value : value >= range.end ? value + delta : range.start + Math.min(value - range.start, text.length);
		const nextSelection = current ? { start: offset(current.start), end: offset(current.end) } : undefined;
		pendingHistory = captureHistory(current);
		pendingHistoryKind = kind;
		emitText(draft().slice(0, range.start) + text + draft().slice(range.end), undefined,
			{ start: range.start, end: range.end, length: text.length }, nextSelection);
		if (active && root && nextSelection) {
			const anchor = findTextPosition(root, nextSelection.start), focus = findTextPosition(root, nextSelection.end);
			if (anchor && focus) getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
			scheduleCaretMeasure();
		}
		if (nextSelection) rememberedSelection = nextSelection;
	} });
	let caretFrame: number | undefined;
	let caretRenderFrame: number | undefined;
	let noteEntryFrame: number | undefined;
	let measurementFrame: number | undefined;
	let contentHeightFrame: number | undefined;
	let contentHeightObserver: ResizeObserver | undefined;
	let enteredNoteId: string | undefined;
	const hasTables = createMemo(() => parseFormattedText(draft()).some((block) => block.kind === "table"));
	const tableFocus = new Map<number, () => void>();
	let formatActiveTableCell: ((format: InlineTextFormat) => void) | undefined;
	const hasTextFragments = createMemo(() => hasTables() || props.wraps().length > 0 || Boolean(props.element().paragraphAlignments?.length));
	const measureCaret = (): void => {
		const root = contentRoot();
		const selection = getSelection();
		if (props.editable && root && document.activeElement === root && selection?.anchorNode && selection.focusNode &&
			root.contains(selection.anchorNode) && root.contains(selection.focusNode)) {
			rememberedSelection = selectionOffsets();
			props.onSelectionAlignmentChange?.(selectionAlignment({ ...props.element(), text: draft() }, rememberedSelection));
		}
		if (
			!props.editable ||
			!root?.isContentEditable ||
			document.activeElement !== root ||
			!selection?.isCollapsed ||
			!selection.focusNode ||
			!root.contains(selection.focusNode)
		) {
			setCaret(undefined);
			setCaretOffset(undefined);
			return;
		}

		setCaretOffset(composing ? undefined : getOffsetBeforeNode(root, selection.focusNode, selection.focusOffset));
		let focusNode = selection.focusNode;
		let focusOffset = selection.focusOffset;
		if (!(focusNode instanceof Text)) {
			const position = findTextPosition(root, getOffsetBeforeNode(root, focusNode, focusOffset));
			if (position) {
				focusNode = position.node;
				focusOffset = position.offset;
			}
		}

		const range = document.createRange();
		range.setStart(focusNode, focusOffset);
		range.collapse(true);
		let bounds = range.getBoundingClientRect();
		if (!bounds.height && focusNode instanceof Text && focusNode.data[focusOffset] === EMPTY_CHARACTER) {
			range.setEnd(focusNode, focusOffset + 1);
			bounds = range.getBoundingClientRect();
		}
		if (!bounds.height) {
			if (focusNode instanceof Text && focusOffset > 0) {
				range.setStart(focusNode, focusOffset - 1);
				range.setEnd(focusNode, focusOffset);
				bounds = range.getBoundingClientRect();
				if (bounds.height) {
					setCaret({
						left: bounds.right - textSurface.getBoundingClientRect().left,
						top: bounds.top - textSurface.getBoundingClientRect().top,
						height: bounds.height,
					});
					return;
				}
			}

			const parent = focusNode instanceof Element ? focusNode : focusNode.parentElement;
			const fragment = parent?.closest<HTMLElement>("[data-text-fragment]");
			if (!fragment) {
				setCaret(undefined);
				return;
			}
			const fragmentBounds = fragment.getBoundingClientRect();
			const lineHeight = Number.parseFloat(getComputedStyle(fragment).lineHeight) || metrics().lineHeight;
			const surfaceBounds = textSurface.getBoundingClientRect();
			setCaret({
				left: fragmentBounds.left - surfaceBounds.left,
				top: fragmentBounds.top - surfaceBounds.top,
				height: lineHeight,
			});
			return;
		}

		const surfaceBounds = textSurface.getBoundingClientRect();
		setCaret({
			left: bounds.left - surfaceBounds.left,
			top: bounds.top - surfaceBounds.top,
			height: bounds.height,
		});
	};
	const scheduleCaretMeasure = (): void => {
		if (caretRenderFrame !== undefined) return;
		caretRenderFrame = requestAnimationFrame(() => {
			caretRenderFrame = undefined;
			measureCaret();
		});
	};
	const caretAnchor = (): CaretGeometry | undefined => {
		const current = caret();
		if (!current) return;
		const bounds = textSurface.getBoundingClientRect();
		return { left: bounds.left + current.left, top: bounds.top + current.top, height: current.height };
	};
	const observeNaturalTextNode = (node?: HTMLElement): void => {
		if (observedNaturalTextNode !== node) {
			if (observedNaturalTextNode) contentHeightObserver?.unobserve(observedNaturalTextNode);
			observedNaturalTextNode = node;
		}
		if (node && !hasTextFragments()) contentHeightObserver?.observe(node);
	};
	const measureText = (value: string): number => {
		const cached = measureCache.get(value);
		if (cached !== undefined) return cached;
		const currentMetrics = metrics();
		const context = (measureContext ??= document.createElement("canvas").getContext("2d"));
		if (context) context.font = currentMetrics.font;
		const measured = context?.measureText(value).width ?? value.length * 8;
		const characterCount = HIGH_SURROGATE.test(value) ? [...value].length : value.length;
		const width = (measured + Math.max(0, characterCount - 1) * currentMetrics.letterSpacing) * measurementScale();
		if (measureCache.size >= 4096) measureCache.clear();
		measureCache.set(value, width);
		return width;
	};

	const calibrateTextMeasurement = (): void => {
		if (!props.editable) return;
		const root = contentRoot();
		if (!root?.isConnected) return;

		const currentScale = measurementScale();
		let correctedScale = currentScale;
		for (const fragment of root.querySelectorAll<HTMLElement>("[data-text-fragment]")) {
			const text = (fragment.textContent ?? "").replaceAll(EMPTY_CHARACTER, "");
			if (!text || text.includes("\n")) continue;

			const availableWidth = fragment.getBoundingClientRect().width;
			const measuredWidth = measureText(text);
			if (measuredWidth <= 0 || !Number.isFinite(measuredWidth) || measuredWidth < availableWidth * 0.9) {
				continue;
			}

			const range = document.createRange();
			range.selectNodeContents(fragment);
			const renderedWidth = range.getBoundingClientRect().width;
			if (renderedWidth <= availableWidth + 1) continue;

			correctedScale = Math.max(correctedScale, (currentScale * renderedWidth) / measuredWidth * 1.01);
		}

		if (correctedScale <= currentScale + 0.005) return;

		const selection = getSelection();
		const caretOffset =
			selection?.isCollapsed && selection.focusNode && root.contains(selection.focusNode)
				? getOffsetBeforeNode(root, selection.focusNode, selection.focusOffset)
				: undefined;
		measureCache.clear();
		setMeasurementScale(correctedScale);
		if (caretOffset !== undefined) setPendingCaret(caretOffset);
	};

	const measureFormattedRun = (run: TextRun, scale: number, heading: boolean): number => {
		const current = metrics();
		const context = (measureContext ??= document.createElement("canvas").getContext("2d"));
		let font = current.font.replace(/([\d.]+)px/, (_match, size: string) => `${Number(size) * scale}px`);
		if (run.bold || heading) font = font.replace(/\b\d{3}(?=\s+[\d.]+px)/, run.bold ? "700" : "600");
		if (run.italic) font = font.replace(/^\S+/, "italic");
		if (run.code) font = font.replace(/(px)\s+.+$/, `$1 ${codeFont}`);
		if (context) context.font = font;
		return (context?.measureText(run.text).width ?? run.text.length * 8 * scale) + Math.max(0, [...run.text].length - 1) * current.letterSpacing;
	};

	const layout = createMemo<TextFlowLayout>(() => {
		const currentMetrics = metrics();
		if (!hasTextFragments()) {
			return {
				fragments: [],
				lineCount: 1,
				height: Math.max(currentMetrics.lineHeight, height()),
			};
		}
		if (!props.editable || hasTables()) {
			const formatted = layoutFormattedText({
				text: draft(), x: x(), y: y(), width: width(), lineHeight: currentMetrics.lineHeight,
				elements: props.wraps(), imageMargin: IMAGE_TEXT_MARGIN,
				measureRun: measureFormattedRun, displayText,
				alignment: alignment(), paragraphAlignments: props.element().paragraphAlignments,
				tableHeights: tableHeights(),
				rawText: props.editable, measureRawText: measureText,
			});
			return { ...formatted, height: Math.max(formatted.height, height()) };
		}

		const currentLayout = layoutTextFlow({
			text: draft(),
			textX: x(),
			textY: y(),
			width: width(),
			lineHeight: currentMetrics.lineHeight,
			elements: props.wraps(),
			measureText,
			displayText: (value) => (props.editable ? value : displayText(value)),
			imageMargin: IMAGE_TEXT_MARGIN,
		});
		const starts = paragraphStarts(draft());
		return {
			...currentLayout,
			fragments: currentLayout.fragments.map((fragment) => {
				const paragraph = paragraphIndexAt(starts, fragment.start);
				const end = starts[paragraph + 1] ?? draft().length;
				return {
					...fragment, alignment: props.element().paragraphAlignments?.[paragraph] ?? alignment(),
					paragraphEnd: fragment.end >= end
				};
			}),
			height: Math.max(currentLayout.height, height()),
		};
	});

	const syncMetrics = (): void => {
		if (!textSurface) return;
		const computed = getComputedStyle(textSurface);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const parsedLineHeight = Number.parseFloat(computed.lineHeight);
		const parsedLetterSpacing = Number.parseFloat(computed.letterSpacing);
		measureCache.clear();
		setMetrics({
			font: `${computed.fontStyle} ${computed.fontWeight} ${fontSize}px ${computed.fontFamily}`,
			lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.65,
			letterSpacing: Number.isFinite(parsedLetterSpacing) ? parsedLetterSpacing : 0,
		});
	};

	const syncEditableContent = (): void => {
		const root = contentRoot();
		if (!props.editable || !root) return;
		const currentLayout = {
			text: draft(),
			x: x(),
			y: y(),
			width: width(),
			alignment: alignment(),
			fragments: hasTextFragments() ? layout().fragments : undefined,
			naturalClass: styles.naturalFragment,
			fragmentClass: styles.fragment,
		};
		if (composing) return;
		const selection = getSelection();
		const offsets =
			document.activeElement === root && selection?.anchorNode && selection.focusNode &&
				root.contains(selection.anchorNode) && root.contains(selection.focusNode)
				? {
					anchor: getOffsetBeforeNode(root, selection.anchorNode, selection.anchorOffset),
					focus: getOffsetBeforeNode(root, selection.focusNode, selection.focusOffset),
				}
				: undefined;
		naturalTextNode = syncEditableTextDom(root, currentLayout);
		if (offsets && selection) {
			const anchor = findTextPosition(root, Math.min(offsets.anchor, currentLayout.text.length));
			const focus = findTextPosition(root, Math.min(offsets.focus, currentLayout.text.length));
			if (anchor && focus && (
				selection.anchorNode !== anchor.node || selection.anchorOffset !== anchor.offset ||
				selection.focusNode !== focus.node || selection.focusOffset !== focus.offset
			)) {
				selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
			}
		}
		observeNaturalTextNode(naturalTextNode);
	};

	onMount(() => {
		syncMetrics();
		void document.fonts?.ready.then(syncMetrics);
		const handleSelectionChange = (): void => scheduleCaretMeasure();
		const handleViewportChange = (): void => scheduleCaretMeasure();
		document.addEventListener("selectionchange", handleSelectionChange);
		document.addEventListener("scroll", handleViewportChange, true);
		addEventListener("resize", handleViewportChange);
		contentHeightObserver = new ResizeObserver(() => {
			scheduleCaretMeasure();
			if (!naturalTextNode || hasTextFragments()) return;
			props.onHeightChange?.(
				y() + Math.max(naturalTextNode.getBoundingClientRect().height, metrics().lineHeight),
			);
		});
		observeNaturalTextNode(naturalTextNode);
		onCleanup(() => {
			document.removeEventListener("selectionchange", handleSelectionChange);
			document.removeEventListener("scroll", handleViewportChange, true);
			removeEventListener("resize", handleViewportChange);
		});
	});

	createEffect(() => {
		const value = props.element().text;
		if (value !== untrack(draft)) {
			setDraft(value);
		}
	});

	createEffect(syncEditableContent);
	createEffect(() => {
		const editable = props.editable;
		const root = editable ? textSurface : contentRoot();
		draft();
		if (!root) return;
		const observer = new ResizeObserver((entries) => {
			setTableHeights((previous) => {
				const next = { ...previous };
				let changed = false;
				for (const entry of entries) {
					const table = entry.target as HTMLTableElement;
					if (!table.isConnected) continue;
					const sourceLine = Number(table.dataset.editableTable ?? table.dataset.formattedTable ?? table.dataset.formattedCode);
					const height = Math.ceil(table.getBoundingClientRect().height);
					if (next[sourceLine] !== height) { next[sourceLine] = height; changed = true; }
				}
				return changed ? next : previous;
			});
		});
		const frame = requestAnimationFrame(() => {
			for (const table of root.querySelectorAll<HTMLElement>(editable ? "[data-editable-table]" : "[data-formatted-table], [data-formatted-code]")) observer.observe(table);
		});
		onCleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); });
	});
	createEffect(() => {
		const noteId = props.element().id;
		if (historyNoteId === noteId) return;
		historyNoteId = noteId;
		urlPastes.clear();
		history.clear();
		setTableHeights({});
		pendingHistory = undefined;
		pendingHistoryKind = "replace";
	});

	createEffect(() => {
		const noteId = props.element().id;
		const root = contentRoot();
		if (!root || noteId === enteredNoteId) return;

		enteredNoteId = noteId;
		const editable = untrack(() => props.editable || Boolean(props.locked));
		if (noteEntryFrame !== undefined) cancelAnimationFrame(noteEntryFrame);
		noteEntryFrame = requestAnimationFrame(() => {
			noteEntryFrame = undefined;
			const currentRoot = contentRoot();
			const viewport = currentRoot?.closest<HTMLElement>("[data-omega-scroll-viewport]");
			if (!currentRoot?.isConnected || currentRoot !== root || props.element().id !== noteId) return;

			if (!editable) {
				if (viewport) viewport.scrollTop = 0;
				return;
			}
			if (!currentRoot.isContentEditable) return;

			const textLength = getVisibleLength(draft());
			const position =
				findTextPosition(currentRoot, textLength) ||
				(textLength === 0 ? ensureEmptyTextPosition(currentRoot) : undefined);
			const selection = getSelection();
			if (!position || !selection) return;

			currentRoot.focus({ preventScroll: true });
			selection.removeAllRanges();
			selection.collapse(position.node, position.offset);
			scheduleCaretMeasure();

			if (!viewport) return;
			noteEntryFrame = requestAnimationFrame(() => {
				noteEntryFrame = undefined;
				if (!currentRoot.isConnected || contentRoot() !== currentRoot || props.element().id !== noteId || document.activeElement !== currentRoot) return;
				const endOffset = getVisibleLength(draft());
				const endPosition =
					findTextPosition(currentRoot, endOffset) ||
					(endOffset === 0 ? ensureEmptyTextPosition(currentRoot) : undefined);
				if (!endPosition) return;

				const range = document.createRange();
				range.setStart(endPosition.node, endPosition.offset);
				range.collapse(true);
				let bounds = range.getBoundingClientRect();
				if (!bounds.height) {
					const fragment = endPosition.node.parentElement?.closest<HTMLElement>("[data-text-fragment]");
					if (fragment) bounds = fragment.getBoundingClientRect();
				}
				const viewportBounds = viewport.getBoundingClientRect();
				const scrollTop = viewport.scrollTop;
				const caretTop = bounds.top - viewportBounds.top + scrollTop;
				const caretBottom = bounds.bottom - viewportBounds.top + scrollTop;
				const margin = 24;
				if (caretBottom > scrollTop + viewport.clientHeight - margin) {
					viewport.scrollTop = viewport.scrollHeight;
				} else if (caretTop < scrollTop + margin) {
					viewport.scrollTop = Math.max(0, caretTop - margin);
				}
			});
		});
	});

	createEffect(() => {
		const hasWraps = hasTextFragments();
		const pageY = y();
		const naturalNode = naturalTextNode;
		if (!contentRoot()) return;

		if (hasWraps) {
			if (contentHeightFrame !== undefined) cancelAnimationFrame(contentHeightFrame);
			contentHeightFrame = undefined;
			observeNaturalTextNode(undefined);
			props.onHeightChange?.(pageY + layout().height);
			return;
		}

		if (!naturalNode) return;
		observeNaturalTextNode(naturalNode);
		if (contentHeightFrame !== undefined) cancelAnimationFrame(contentHeightFrame);
		contentHeightFrame = requestAnimationFrame(() => {
			contentHeightFrame = undefined;
			if (!naturalNode.isConnected) return;
			props.onHeightChange?.(
				pageY + Math.max(naturalNode.getBoundingClientRect().height, metrics().lineHeight),
			);
		});
	});

	createEffect(() => {
		if (!hasTextFragments()) return;
		layout();
		contentRoot();
		if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
		measurementFrame = requestAnimationFrame(() => {
			measurementFrame = undefined;
			calibrateTextMeasurement();
		});
	});

	createEffect(() => {
		const offset = pendingCaret();
		const root = contentRoot();
		layout();
		if (offset === undefined || !root) return;
		if (caretFrame !== undefined) cancelAnimationFrame(caretFrame);
		caretFrame = requestAnimationFrame(() => {
			if (!root.isConnected || !root.isContentEditable) {
				setPendingCaret(undefined);
				return;
			}

			const position = findTextPosition(root, offset) || (!draft() ? ensureEmptyTextPosition(root) : undefined);
			const selection = getSelection();
			if (!position || !selection) {
				setPendingCaret(undefined);
				return;
			}

			root.focus({ preventScroll: true });
			selection.removeAllRanges();
			selection.collapse(position.node, position.offset);
			setPendingCaret(undefined);
			scheduleCaretMeasure();
		});
	});

	createEffect(() => {
		if (!props.editable) {
			setCaret(undefined);
			setCaretOffset(undefined);
			return;
		}
		draft();
		layout();
		x();
		y();
		width();
		contentRoot();
		scheduleCaretMeasure();
	});

	const captureHistory = (selection = selectionOffsets()): TextHistoryState => ({
		text: draft(),
		paragraphAlignments: props.element().paragraphAlignments?.slice(),
		selection: { ...selection },
		scrollTop: contentRoot()?.closest<HTMLElement>("[data-omega-scroll-viewport]")?.scrollTop ?? 0,
	});

	const restoreHistory = (state: TextHistoryState | undefined): void => {
		urlPastes.clear();
		pendingHistory = undefined;
		pendingHistoryKind = "replace";
		if (!state) return;
		if (caretFrame !== undefined) cancelAnimationFrame(caretFrame);
		caretFrame = undefined;
		setPendingCaret(undefined);
		setDraft(state.text);
		props.onChange({ ...props.element(), text: state.text, paragraphAlignments: state.paragraphAlignments?.slice() });
		syncEditableContent();
		const root = contentRoot();
		if (!root?.isContentEditable) return;
		const anchor = findTextPosition(root, Math.min(state.selection.start, state.text.length)) || (!state.text ? ensureEmptyTextPosition(root) : undefined);
		const focus = findTextPosition(root, Math.min(state.selection.end, state.text.length)) || anchor;
		root.focus({ preventScroll: true });
		if (anchor && focus) getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		const restoredTable = layout().fragments.find((fragment) => fragment.format?.block.kind === "table" && state.selection.start >= fragment.start && state.selection.start < fragment.end);
		if (restoredTable) tableFocus.get(restoredTable.format!.block.sourceLine)?.();
		rememberedSelection = { ...state.selection };
		const viewport = root.closest<HTMLElement>("[data-omega-scroll-viewport]");
		if (viewport) viewport.scrollTop = state.scrollTop;
		caretFrame = requestAnimationFrame(() => {
			caretFrame = undefined;
			if (!root.isConnected || contentRoot() !== root || draft() !== state.text) return;
			if (viewport) viewport.scrollTop = state.scrollTop;
			scheduleCaretMeasure();
		});
		scheduleCaretMeasure();
	};

	const emitText = (text: string, caret?: number, change?: { start: number; end: number; length: number }, historySelection?: TextSelection, restoredAlignments?: NoteTextAlignment[]): void => {
		const before = pendingHistory ?? captureHistory();
		const kind = pendingHistoryKind;
		pendingHistory = undefined;
		pendingHistoryKind = "replace";
		const paragraphAlignments = restoredAlignments?.slice() ?? remapParagraphAlignments(draft(), text, props.element().paragraphAlignments, alignment(), change);
		urlPastes.changed(draft(), text, change);
		if (caretFrame !== undefined) cancelAnimationFrame(caretFrame);
		caretFrame = undefined;
		setDraft(text);
		syncEditableContent();
		setPendingCaret(undefined);
		if (caret !== undefined) {
			const root = contentRoot();
			const position = root && findTextPosition(root, Math.min(caret, text.length));
			const selection = getSelection();
			if (root?.isContentEditable && position && selection) {
				root.focus({ preventScroll: true });
				selection.removeAllRanges();
				selection.collapse(position.node, position.offset);
				scheduleCaretMeasure();
			}
		}
		if (text !== props.element().text) props.onChange({ ...props.element(), text, paragraphAlignments });
		history.record(before, { ...captureHistory(historySelection ?? (caret !== undefined ? { start: caret, end: caret } : selectionOffsets())), text, paragraphAlignments: paragraphAlignments?.slice() }, kind);
	};

	const selectionOffsets = (): { start: number; end: number } => {
		const root = contentRoot();
		const selection = getSelection();
		if (
			!root ||
			!selection?.rangeCount ||
			!root.contains(selection.anchorNode) ||
			!root.contains(selection.focusNode)
		) {
			const end = getVisibleLength(root?.textContent ?? draft());
			return { start: end, end };
		}
		const anchor = getOffsetBeforeNode(root, selection.anchorNode!, selection.anchorOffset);
		const focus = getOffsetBeforeNode(root, selection.focusNode!, selection.focusOffset);
		return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
	};

	const touchesProtectedTable = (range: TextSelection, replacement = ""): boolean => range.start < range.end &&
		layout().fragments.some((fragment) => {
			if (fragment.format?.block.kind !== "table") return false;
			if (range.start < fragment.end && range.end > fragment.start) return true;
			if (range.end !== fragment.start || range.start >= fragment.start) return false;
			const before = draft().slice(0, range.start) + replacement;
			return Boolean(before) && !before.endsWith("\n");
		});

	const editableSourceText = (): string => {
		const root = contentRoot();
		if (!root) return draft();
		return [...root.childNodes].map((node) => {
			const text = node.textContent ?? "";
			if (node instanceof HTMLElement && node.hasAttribute("data-before-table") &&
				text.replaceAll(EMPTY_CHARACTER, "") && !text.endsWith("\n")) return text + "\n";
			return text;
		}).join("");
	};

	const replaceSelection = (
		replacement: string,
		range = selectionOffsets(),
		caretInReplacement?: number,
		restoredAlignments?: NoteTextAlignment[],
	): void => {
		if (touchesProtectedTable(range, replacement)) {
			pendingHistory = undefined;
			pendingHistoryKind = "replace";
			return;
		}
		pendingHistory ??= captureHistory();
		const { start, end } = range;
		const rawValue = editableSourceText();
		const value = hasTextFragments() ? rawValue.replaceAll(EMPTY_CHARACTER, "") : stripEmptyCharacter(rawValue);
		const normalizedReplacement = replacement.replaceAll(EMPTY_CHARACTER, "");
		const beforeTable = start === end && layout().fragments.some((fragment) => fragment.beforeTable && fragment.start === start);
		const insertion = normalizedReplacement + (beforeTable && normalizedReplacement && !normalizedReplacement.endsWith("\n") ? "\n" : "");
		const next = value.slice(0, start) + insertion + value.slice(end);
		let caret = start + (caretInReplacement ?? normalizedReplacement.length);
		if (!insertion && start < end && value[end - 1] === "\n") {
			const tableAtCaret = parseFormattedText(next).some((block) => block.kind === "table" && paragraphStarts(next)[block.sourceLine] === caret);
			if (tableAtCaret && caret > 0 && next[caret - 2] !== "\n") caret--;
		}
		emitText(next, caret, { start, end, length: insertion.length }, undefined, restoredAlignments);
	};
	const linkSuggestions = useNoteLinkSuggestions({
		notes: () => props.notes,
		text: draft,
		caretOffset,
		onSelect: (note, context) => {
			const target = /[\[\]|\r\n]/.test(note.title) ? note.id : note.title;
			const link = `[[${target}${context.alias}]]`;
			batch(() => {
				replaceSelection(link, { start: context.start, end: context.end });
				setCaretOffset(context.start + link.length);
			});
		},
	});

	const processInput = (preserveCaret = true): void => {
		if (composing) return;
		const root = contentRoot();
		if (!root) return;
		const rawText = editableSourceText();
		const text = hasTextFragments() ? rawText.replaceAll(EMPTY_CHARACTER, "") : stripEmptyCharacter(rawText);
		const selection = getSelection();
		const caret =
			preserveCaret && !text
				? 0
				: preserveCaret &&
					document.activeElement === root &&
					selection?.focusNode &&
					root.contains(selection.focusNode)
					? getOffsetBeforeNode(root, selection.focusNode, selection.focusOffset)
					: undefined;
		emitText(text, caret);
	};

	const flushInput = (preserveCaret = true): void => {
		processInput(preserveCaret);
	};

	const handleBeforeInput = (event: InputEvent): void => {
		if (!props.editable || composing || event.isComposing || !event.cancelable) return;
		if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
			event.preventDefault();
			restoreHistory(event.inputType === "historyUndo" ? history.undo() : history.redo());
			return;
		}
		pendingHistory = captureHistory();
		pendingHistoryKind = event.inputType;
		if (hasTables()) {
			const range = selectionOffsets();
			const tables = layout().fragments.filter((fragment) => fragment.format?.block.kind === "table");
			if (event.inputType.startsWith("delete") && !["deleteContentBackward", "deleteContentForward"].includes(event.inputType)) {
				const root = contentRoot();
				const target = event.getTargetRanges?.()[0];
				let deletion = { ...range };
				if (root && target && root.contains(target.startContainer) && root.contains(target.endContainer)) {
					deletion = { start: getOffsetBeforeNode(root, target.startContainer, target.startOffset), end: getOffsetBeforeNode(root, target.endContainer, target.endOffset) };
				} else if (deletion.start === deletion.end && /Word|Line/.test(event.inputType)) {
					const backward = event.inputType.endsWith("Backward");
					if (/Word/.test(event.inputType)) {
						if (backward) deletion.start -= draft().slice(0, deletion.start).match(/\s*\S+\s*$/)?.[0].length ?? 0;
						else deletion.end += draft().slice(deletion.end).match(/^\s*\S+\s*/)?.[0].length ?? 0;
					} else if (backward) deletion.start = draft().lastIndexOf("\n", deletion.start - 1) + 1;
					else { const newline = draft().indexOf("\n", deletion.end); deletion.end = newline < 0 ? draft().length : newline + 1; }
				}
				if (touchesProtectedTable(deletion)) {
					event.preventDefault();
					pendingHistory = undefined;
					return;
				}
			}
			if (event.inputType === "insertText" && event.data !== null) {
				event.preventDefault();
				const atTableEnd = range.start === range.end && range.end === draft().length && tables.some((table) => table.end === range.end);
				replaceSelection((atTableEnd ? "\n" : "") + event.data, range);
				return;
			}
			if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") {
				event.preventDefault();
				const backward = event.inputType === "deleteContentBackward";
				let { start, end } = range;
				if (start === end) {
					const adjacent = tables.find((table) => backward ? table.end === start : table.start === end);
					if (adjacent) { pendingHistory = undefined; return; }
					else if (backward && start > 0) start -= draft().codePointAt(start - 2)! > 0xffff ? 2 : 1;
					else if (!backward && end < draft().length) end += draft().codePointAt(end)! > 0xffff ? 2 : 1;
				}
				replaceSelection("", { start, end });
				return;
			}
		}
		const backward = event.inputType === "deleteContentBackward";
		const forward = event.inputType === "deleteContentForward";
		if (!backward && !forward) return;
		const range = selectionOffsets();
		const text = draft();
		let { start, end } = range;
		if (start === end) {
			if (backward && start > 0 && text[start - 1] === "\n") start -= 1;
			else if (forward && text[end] === "\n") end += 1;
			else return;
		} else if (text.slice(start, end) !== "\n") return;
		event.preventDefault();
		replaceSelection("", { start, end });
	};

	const handleInput = (): void => {
		if (composing) return;
		processInput();
		scheduleCaretMeasure();
	};

	const caretPositionAtPoint = (
		root: HTMLDivElement,
		clientX: number,
		clientY: number,
	): CaretPosition | undefined => {
		const directPosition = getNativeCaretPosition(root, clientX, clientY);
		const directParent = directPosition?.node instanceof Element
			? directPosition.node
			: directPosition?.node.parentElement;
		if (directPosition && directParent?.closest("[data-text-fragment]")) return directPosition;

		const fragments = [...root.querySelectorAll<HTMLElement>("[data-text-fragment]:not([data-editable-table-source])")];
		let nearest: HTMLElement | undefined;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const fragment of fragments) {
			const bounds = fragment.getBoundingClientRect();
			const dx = Math.max(bounds.left - clientX, 0, clientX - bounds.right);
			const dy = Math.max(bounds.top - clientY, 0, clientY - bounds.bottom);
			const distance = dx * dx + dy * dy;
			if (distance < nearestDistance) {
				nearest = fragment;
				nearestDistance = distance;
			}
		}

		const node = nearest?.firstChild;
		if (!nearest || !(node instanceof Text)) return undefined;

		const fragmentRange = document.createRange();
		fragmentRange.selectNodeContents(nearest);
		const lineRects = [...fragmentRange.getClientRects()];
		let nearestLine: DOMRect | undefined;
		let nearestLineDistance = Number.POSITIVE_INFINITY;
		for (const line of lineRects) {
			const dx = Math.max(line.left - clientX, 0, clientX - line.right);
			const dy = Math.max(line.top - clientY, 0, clientY - line.bottom);
			const distance = dx * dx + dy * dy;
			if (distance < nearestLineDistance) {
				nearestLine = line;
				nearestLineDistance = distance;
			}
		}

		if (nearestLine) {
			const projectedPosition = getNativeCaretPosition(
				root,
				Math.max(nearestLine.left, Math.min(clientX, nearestLine.right)),
				Math.max(nearestLine.top, Math.min(clientY, nearestLine.bottom)),
			);
			const projectedParent = projectedPosition?.node instanceof Element
				? projectedPosition.node
				: projectedPosition?.node.parentElement;
			if (projectedPosition && projectedParent?.closest("[data-text-fragment]")) {
				return projectedPosition;
			}
		}

		const text = (node.textContent ?? "").replaceAll(EMPTY_CHARACTER, "");
		if (!text) return { node, offset: 0 };

		const bounds = nearest.getBoundingClientRect();
		let nearestOffset = 0;
		let nearestDistanceFromX = Number.POSITIVE_INFINITY;
		let offset = 0;
		const checkOffset = (): void => {
			const distance = Math.abs(bounds.left + measureText(text.slice(0, offset)) - clientX);
			if (distance < nearestDistanceFromX) {
				nearestOffset = offset;
				nearestDistanceFromX = distance;
			}
		};

		checkOffset();
		for (const character of text) {
			offset += character.length;
			checkOffset();
		}
		return findTextPosition(root, Number(nearest.dataset.start) + nearestOffset) ?? { node, offset: nearestOffset };
	};

	const placeCaretAtPoint: CaretPlacement = (clientX, clientY): boolean => {
		if (!props.editable) return false;
		const root = contentRoot();
		if (!root?.isContentEditable) return false;

		const position = draft()
			? caretPositionAtPoint(root, clientX, clientY)
			: ensureEmptyTextPosition(root);
		const selection = getSelection();
		if (!position || !selection) return false;

		root.focus({ preventScroll: true });
		selection.removeAllRanges();
		selection.collapse(position.node, position.offset);
		scheduleCaretMeasure();
		return true;
	};

	const handleFocus = (): void => {
		const root = contentRoot();
		if (!draft() && root) {
			const position = ensureEmptyTextPosition(root);
			const selection = getSelection();
			if (position && selection && (!selection.focusNode || !root.contains(selection.focusNode))) {
				selection.removeAllRanges();
				selection.collapse(position.node, position.offset);
			}
		}
		scheduleCaretMeasure();
	};
	const handleKeyUp = (): void => scheduleCaretMeasure();
	const handlePointerUp = (): void => scheduleCaretMeasure();
	const handleBlur = (): void => {
		lastOpeningBracket = undefined;
		pendingBracketDeletion = undefined;
		rememberedSelection = selectionOffsets();
		flushInput(false);
		setCaret(undefined);
		setCaretOffset(undefined);
	};

	const handlePointerDown = (event: PointerEvent): void => {
		lastOpeningBracket = undefined;
		pendingBracketDeletion = undefined;
		if (!props.editable) return;
		if (event.button !== 0) {
			if (event.button === 2) event.preventDefault();
			return;
		}
		const root = contentRoot();
		if (!root?.isContentEditable) return;

		if (hasTextFragments()) {
			const bounds = textSurface.getBoundingClientRect();
			const pageX = event.clientX - bounds.left;
			const pageY = event.clientY - bounds.top;
			const hitsImageMargin = props
				.wraps()
				.some(
					(image) =>
						pageX >= image.x - IMAGE_TEXT_MARGIN &&
						pageX <= image.x + image.width + IMAGE_TEXT_MARGIN &&
						pageY >= image.y - IMAGE_TEXT_MARGIN &&
						pageY <= image.y + image.height + IMAGE_TEXT_MARGIN,
				);

			if (hitsImageMargin) {
				event.preventDefault();
				return;
			}
		}

		const target = event.target;
		if (draft() && target instanceof Element && target.closest("[data-text-fragment]")) {
			root.focus({ preventScroll: true });
			scheduleCaretMeasure();
			return;
		}

		if (placeCaretAtPoint(event.clientX, event.clientY)) event.preventDefault();
	};

	const moveFromEmptyLine = (event: KeyboardEvent): boolean => {
		if (!props.editable || props.locked || event.ctrlKey || event.metaKey || event.altKey ||
			(event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
		const root = contentRoot();
		const selection = getSelection();
		if (!root || !selection?.focusNode || !selection.anchorNode || !root.contains(selection.focusNode) ||
			(!selection.isCollapsed && !event.shiftKey)) return false;
		const offset = getOffsetBeforeNode(root, selection.focusNode, selection.focusOffset);
		const starts = paragraphStarts(draft());
		const paragraph = paragraphIndexAt(starts, offset);
		const end = starts[paragraph + 1] === undefined ? draft().length : starts[paragraph + 1]! - 1;
		if (draft().slice(starts[paragraph], end).length) return false;
		const previous = event.key === "ArrowUp";
		const target = previous ? paragraph - 1 : paragraph + 1;
		if (target < 0 || target >= starts.length) return false;
		const nextOffset = previous ? starts[paragraph]! - 1 : starts[target]!;
		const table = layout().fragments.find((fragment) => fragment.format?.block.kind === "table" &&
			nextOffset >= fragment.start && nextOffset < fragment.end);
		if (table && !layout().fragments.some((fragment) => fragment.beforeTable && fragment.start === nextOffset)) return false;
		const position = findTextPosition(root, nextOffset);
		if (!position) return false;
		event.preventDefault();
		if (event.shiftKey) selection.setBaseAndExtent(selection.anchorNode, selection.anchorOffset, position.node, position.offset);
		else selection.collapse(position.node, position.offset);
		scheduleCaretMeasure();
		return true;
	};

	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== "[" && !["Shift", "Alt", "AltGraph", "Control"].includes(event.key)) lastOpeningBracket = undefined;
		if (!["Backspace", "Delete"].includes(event.key)) pendingBracketDeletion = undefined;
		if (composing || event.isComposing) { lastOpeningBracket = undefined; pendingBracketDeletion = undefined; return; }
		if (props.editable && !props.locked && (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
			event.preventDefault();
			event.stopPropagation();
			flushInput(false);
			const redo = event.key.toLowerCase() === "y" || event.shiftKey;
			restoreHistory(redo ? history.redo() : history.undo());
			return;
		}
		if (props.editable && !props.locked && !event.ctrlKey && !event.metaKey && !event.altKey && ["Backspace", "Delete"].includes(event.key)) {
			const previous = pendingBracketDeletion;
			pendingBracketDeletion = undefined;
			const range = selectionOffsets();
			const text = draft();
			if (range.start === range.end && previous?.key === event.key && previous.offset === range.start && previous.text === text) {
				event.preventDefault();
				replaceSelection(text.slice(previous.start + 1, previous.close), { start: previous.start, end: previous.close + 2 }, 0);
				return;
			}
			if (range.end - range.start === 2 && text.slice(range.start, range.end) === "[[") {
				const context = noteLinkAtCaret(text, range.end);
				if (context?.start === range.start) {
					event.preventDefault();
					replaceSelection(text.slice(range.end, context.end - 2), { start: range.start, end: context.end }, 0);
					return;
				}
			}
			if (range.start === range.end) {
				const backward = event.key === "Backspace";
				const context = noteLinkAtCaret(text, backward ? range.start : range.start + 2);
				if (context?.start === (backward ? range.start - 2 : range.start)) {
					const removed = backward ? range.start - 1 : range.start;
					pendingBracketDeletion = {
						key: event.key, offset: removed, start: context.start, close: context.end - 3,
						text: text.slice(0, removed) + text.slice(removed + 1)
					};
				}
			}
		}
		if (props.editable && !props.locked && event.key === "[" && !event.metaKey && (!event.ctrlKey || event.altKey || event.getModifierState("AltGraph"))) {
			const previous = lastOpeningBracket;
			lastOpeningBracket = undefined;
			if (event.repeat) return;
			const range = selectionOffsets();
			const elapsed = previous ? event.timeStamp - previous.time : Infinity;
			const wrappingSelection = previous?.selectedText !== undefined && previous.expectedText === draft();
			if (range.start === range.end && previous?.offset === range.start &&
				(wrappingSelection || (elapsed >= 0 && elapsed <= LINK_BRACKET_INTERVAL)) && draft()[range.start - 1] === "[") {
				event.preventDefault();
				pendingHistoryKind = "insertText";
				const body = wrappingSelection ? previous.selectedText! : "";
				const closing = !wrappingSelection && draft().slice(range.start, range.start + 2) === "]]" ? "" : "]]";
				replaceSelection(`[${body}${closing}`, range, 1 + body.length, wrappingSelection ? previous.paragraphAlignments : undefined);
				return;
			}
			lastOpeningBracket = {
				time: event.timeStamp, offset: range.start + 1,
				...(range.end > range.start ? {
					selectedText: draft().slice(range.start, range.end),
					expectedText: draft().slice(0, range.start) + "[" + draft().slice(range.end),
					paragraphAlignments: props.element().paragraphAlignments?.slice(),
				} : {}),
			};
			return;
		}
		if (props.editable && linkSuggestions.handleKeyDown(event)) return;
		if (props.editable && !props.locked && event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			const range = selectionOffsets();
			const boundary = range.start === range.end && layout().fragments.some((fragment) => fragment.beforeTable && fragment.start === range.start);
			const atTableEnd = range.start === range.end && range.end === draft().length &&
				layout().fragments.some((fragment) => fragment.format?.block.kind === "table" && fragment.end === range.end);
			if (boundary || atTableEnd) {
				if (!event.shiftKey) { pendingHistoryKind = "indent"; replaceSelection((atTableEnd ? "\n" : "") + "    ", range); }
				return;
			}
			const result = indentSelection(draft(), range, event.shiftKey);
			if (result.text === draft() || touchesProtectedTable(result.change, result.replacement)) return;
			pendingHistory = captureHistory(range);
			pendingHistoryKind = "indent";
			emitText(result.text, result.selection.start, result.change, result.selection);
			const root = contentRoot();
			const anchor = root && findTextPosition(root, result.selection.start);
			const focus = root && findTextPosition(root, result.selection.end);
			if (anchor && focus) getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
			rememberedSelection = result.selection;
			return;
		}
		if (moveFromEmptyLine(event)) return;
		if (props.editable && (event.ctrlKey || event.metaKey) && !event.altKey && ["b", "i"].includes(event.key.toLowerCase())) {
			event.preventDefault();
			applyFormatting(event.key.toLowerCase() === "b" ? "bold" : "italic");
			return;
		}
		if (props.editable && event.key === "Enter") {
			event.preventDefault();
			replaceSelection("\n");
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "a") return;
		if (props.editable) flushInput(false);
		const root = contentRoot();
		if (!root) return;

		event.preventDefault();
		event.stopPropagation();
		if (props.editable && !draft()) {
			const position = findTextPosition(root, 0) || ensureEmptyTextPosition(root);
			const selection = getSelection();
			if (position && selection) {
				selection.removeAllRanges();
				selection.collapse(position.node, 0);
				scheduleCaretMeasure();
			}
			return;
		}

		const range = document.createRange();
		range.selectNodeContents(root);
		const selection = getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	};

	const handlePaste = (event: ClipboardEvent): void => {
		if (!props.editable || props.locked) return;
		lastOpeningBracket = undefined;
		pendingBracketDeletion = undefined;
		event.preventDefault();
		const images = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
		if (images.length && props.onPasteImages) {
			flushInput(false);
			props.onPasteImages(images);
			return;
		}
		const text = event.clipboardData?.getData("text/plain");
		if (text === undefined) return;
		const range = selectionOffsets();
		const url = pastedUrl(text);
		if (url && canResolvePastedUrl(draft(), range) && !touchesProtectedTable(range, url)) {
			const kind = urlPastes.kind();
			pendingHistoryKind = kind;
			replaceSelection(url, range);
			urlPastes.resolve(url, { start: range.start, end: range.start + url.length }, resolvePastedLink(url), kind);
		} else replaceSelection(text);
	};

	const handleCompositionEnd = (): void => {
		composing = false;
		handleInput();
	};

	const setNaturalTextNode = (element: HTMLElement): void => {
		naturalTextNode = element;
	};

	const applyFormatting: TextFormatHandler = (format) => {
		if (document.activeElement?.closest("[data-editable-table]")) {
			if (props.editable && !props.locked && ["bold", "italic", "strike", "highlight", "code", "note-link"].includes(format)) formatActiveTableCell?.(format as InlineTextFormat);
			return;
		}
		const root = contentRoot();
		if (!props.editable || !root || composing) return;
		const selection = getSelection();
		const range = selection?.anchorNode && root.contains(selection.anchorNode)
			? selectionOffsets()
			: rememberedSelection ?? { start: draft().length, end: draft().length };
		if (touchesProtectedTable(range)) return;
		const boundary = range.start === range.end && layout().fragments.some((fragment) => fragment.beforeTable && fragment.start === range.start);
		const value = boundary ? draft().slice(0, range.start) + "\n" + draft().slice(range.start) : draft();
		const result = formatSelection(value, range, format, { tableColumnLabel: props.t("tableColumn") });
		pendingHistory = captureHistory(range);
		pendingHistoryKind = "format";
		emitText(result.text, result.selection.start, undefined, result.selection);
		if (format === "table") queueMicrotask(() => {
			const table = layout().fragments.find((fragment) => fragment.format?.block.kind === "table" && result.selection.start >= fragment.start && result.selection.start < fragment.end);
			if (table) tableFocus.get(table.format!.block.sourceLine)?.();
		});
		const anchor = findTextPosition(root, result.selection.start);
		const focus = findTextPosition(root, result.selection.end);
		if (anchor && focus && selection) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		rememberedSelection = result.selection;
	};
	const applyAlignment: ParagraphAlignmentHandler = (value) => {
		if (document.activeElement?.closest("[data-editable-table]")) return;
		const root = contentRoot();
		if (!props.editable || !root || composing) return;
		const selection = getSelection();
		const range = document.activeElement === root && selection?.anchorNode && selection.focusNode &&
			root.contains(selection.anchorNode) && root.contains(selection.focusNode)
			? selectionOffsets() : rememberedSelection ?? { start: draft().length, end: draft().length };
		flushInput(false);
		const before = captureHistory(range);
		const next = alignParagraphSelection({ ...props.element(), text: draft() }, range, value);
		props.onChange(next);
		history.record(before, { ...captureHistory(range), paragraphAlignments: next.paragraphAlignments?.slice() }, "alignment");
		syncEditableContent();
		const anchor = findTextPosition(root, range.start);
		const focus = findTextPosition(root, range.end);
		root.focus({ preventScroll: true });
		if (selection && anchor && focus) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		rememberedSelection = range;
		props.onSelectionAlignmentChange?.(value);
		scheduleCaretMeasure();
	};

	const toggleTask = (sourceLine: number, checked: boolean): void => {
		if (props.locked) return;
		const lines = draft().split("\n");
		const line = lines[sourceLine];
		const marker = line?.match(/^([ \t]*-[ \t]+)\[([ xX]?)\](?=[ \t]|$)/);
		if (!line || !marker) return;
		const start = (paragraphStarts(draft())[sourceLine] ?? 0) + marker[1]!.length;
		const end = start + marker[2]!.length + 2;
		const replacement = checked ? "[x]" : "[ ]";
		pendingHistory = captureHistory({ start, end: start });
		pendingHistoryKind = "task-toggle";
		emitText(draft().slice(0, start) + replacement + draft().slice(end), undefined, { start, end, length: replacement.length });
	};

	const updateTable = (block: TableBlock, replacement: string, kind = "table-structure"): void => {
		if (!props.editable || props.locked) return;
		const starts = paragraphStarts(draft());
		const start = starts[block.sourceLine];
		if (start === undefined || draft().slice(start, start + block.text.length) !== block.text) return;
		const end = start + block.text.length;
		pendingHistory = captureHistory({ start, end: start });
		pendingHistoryKind = kind;
		emitText(draft().slice(0, start) + replacement + draft().slice(end), undefined, { start, end, length: replacement.length }, { start, end: start });
	};
	const deleteTable = (block: TableBlock): void => {
		if (!props.editable || props.locked) return;
		const start = paragraphStarts(draft())[block.sourceLine];
		if (start === undefined || draft().slice(start, start + block.text.length) !== block.text) return;
		const end = start + block.text.length + Number(draft()[start + block.text.length] === "\n");
		if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
		pendingHistory = captureHistory({ start, end: start });
		pendingHistoryKind = "table-delete";
		emitText(draft().slice(0, start) + draft().slice(end), start, { start, end, length: 0 });
	};

	const exitTable = (block: TableBlock, after: boolean): void => {
		const start = paragraphStarts(draft())[block.sourceLine] ?? 0;
		let offset = after ? start + block.text.length : Math.max(0, start - 1);
		if (!after && start === 0) {
			pendingHistory = captureHistory();
			emitText("\n" + draft(), undefined);
		}
		if (after && draft()[offset] === "\n") offset++;
		else if (after) {
			pendingHistory = captureHistory();
			emitText(draft() + "\n", undefined);
			offset++;
		}
		const root = contentRoot();
		const position = root && findTextPosition(root, offset);
		if (root && position) {
			root.focus({ preventScroll: true });
			getSelection()?.collapse(position.node, position.offset);
			scheduleCaretMeasure();
		}
	};

	onMount(() => props.onFormattingReady?.(applyFormatting));
	onMount(() => props.onAlignmentReady?.(applyAlignment));

	onCleanup(() => {
		urlPastes.clear();
		props.onFormattingReady?.(undefined);
		props.onAlignmentReady?.(undefined);
		if (caretFrame !== undefined) cancelAnimationFrame(caretFrame);
		if (caretRenderFrame !== undefined) cancelAnimationFrame(caretRenderFrame);
		if (noteEntryFrame !== undefined) cancelAnimationFrame(noteEntryFrame);
		if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
		if (contentHeightFrame !== undefined) cancelAnimationFrame(contentHeightFrame);
		contentHeightObserver?.disconnect();
	});

	return {
		layout,
		tableFragments: createMemo(() => layout().fragments.filter((fragment) => fragment.format?.block.kind === "table")),
		toggleTask,
		updateTable, deleteTable, exitTable,
		formatTableCell: formatSelection,
		resolvePastedLink, canResolvePastedUrl,
		registerTableFormatting: (handler?: (format: InlineTextFormat) => void) => { formatActiveTableCell = handler; },
		registerTableFocus: (line: number, focus?: () => void) => { if (focus) tableFocus.set(line, focus); else tableFocus.delete(line); },
		caret,
		caretAnchor,
		linkSuggestions,
		hasTextFragments,
		x,
		y,
		width,
		height,
		alignment,
		draft,
		contentRoot,
		setContentRoot,
		setTextSurface: (element: HTMLDivElement) => (textSurface = element),
		setNaturalTextNode,
		handleKeyDown,
		handleInput,
		handleBeforeInput,
		flushInput,
		handlePointerDown,
		handlePointerUp,
		handleFocus,
		handleKeyUp,
		handleBlur,
		handlePaste,
		handleCut: (event: ClipboardEvent) => {
			if (!props.editable || !event.clipboardData) return;
			const range = selectionOffsets();
			if (range.start === range.end) return;
			event.preventDefault();
			if (touchesProtectedTable(range)) return;
			event.clipboardData.setData("text/plain", draft().slice(range.start, range.end));
			replaceSelection("", range);
		},
		handleCopy: (event: ClipboardEvent) => {
			if (!props.editable || !event.clipboardData) return;
			const range = selectionOffsets();
			if (range.start === range.end) return;
			event.preventDefault();
			event.clipboardData.setData("text/plain", draft().slice(range.start, range.end));
		},
		startComposition: () => { pendingHistory = captureHistory(); pendingHistoryKind = "composition"; lastOpeningBracket = undefined; pendingBracketDeletion = undefined; composing = true; setCaretOffset(undefined); },
		handleCompositionEnd,
	};
};
