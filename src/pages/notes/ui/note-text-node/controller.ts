import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type Accessor, type JSX } from "solid-js";
import type { NotePositionedElement, NoteTextElement } from "@/entities/note";
import { layoutTextFlow, type TextFlowLayout } from "../../lib/text-flow-layout";
import { layoutFormattedText } from "../../lib/formatted-text-layout";
import { EMPTY_CHARACTER, syncEditableTextDom } from "../../lib/editable-text-dom";
import { styles } from "./style.css.ts";
import { formatSelection, type TextRun, type TextFormatHandler, type TextSelection, type FormattedFragment } from "@/features/format-text";

const IMAGE_TEXT_MARGIN = 15;
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
	wraps: Accessor<NotePositionedElement[]>;
	onHeightChange?: (height: number) => void;
	editable: boolean;
	locked?: boolean;
	renderText: (text: string, format?: FormattedFragment) => JSX.Element;
	onFormattingReady?: (handler: TextFormatHandler | undefined) => void;
	onChange: (element: NoteTextElement) => void;
};

const displayText = (text: string): string => {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_match, body: string) => {
		const separator = body.indexOf("|");
		return (separator < 0 ? body : body.slice(separator + 1)).trim();
	});
};

const stripEmptyCharacter = (text: string): string => {
	if (text === EMPTY_CHARACTER) return "";
	const start = text.startsWith(EMPTY_CHARACTER) ? 1 : 0;
	const end = text.endsWith(EMPTY_CHARACTER) ? text.length - 1 : text.length;
	return start || end !== text.length ? text.slice(start, Math.max(start, end)) : text;
};

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
				let hiddenCharacters = 0;
				if (offset > 0 && value.startsWith(EMPTY_CHARACTER)) hiddenCharacters += 1;
				if (offset === value.length && value.length > 1 && value.endsWith(EMPTY_CHARACTER)) {
					hiddenCharacters += 1;
				}
				return start + Math.max(0, offset - hiddenCharacters);
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
		const start = Number(fragment.dataset.start);
		const node = fragment.firstChild;
		if (!Number.isFinite(start) || !(node instanceof Text)) continue;

		const value = node.textContent ?? "";
		const visibleLength = getVisibleLength(value);
		if (visibleLength === 0 && requestedOffset === start) return { node, offset: 0 };
		if (requestedOffset >= start && requestedOffset < start + visibleLength) {
			if (!value.startsWith(EMPTY_CHARACTER) && !value.endsWith(EMPTY_CHARACTER)) {
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
	const [contentRoot, setContentRoot] = createSignal<HTMLDivElement>();
	const [draft, setDraft] = createSignal(props.element().text);
	const [pendingCaret, setPendingCaret] = createSignal<number>();
	const [caret, setCaret] = createSignal<CaretGeometry>();
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
	let rememberedSelection: TextSelection | undefined;
	let caretFrame: number | undefined;
	let caretRenderFrame: number | undefined;
	let noteEntryFrame: number | undefined;
	let measurementFrame: number | undefined;
	let contentHeightFrame: number | undefined;
	let contentHeightObserver: ResizeObserver | undefined;
	let enteredNoteId: string | undefined;
	let enteredEditable: boolean | undefined;
	const hasPositionedElements = createMemo(() => props.wraps().length > 0);
	const measureCaret = (): void => {
		const root = contentRoot();
		const selection = getSelection();
		if (
			!props.editable ||
			!root?.isContentEditable ||
			document.activeElement !== root ||
			!selection?.isCollapsed ||
			!selection.focusNode ||
			!root.contains(selection.focusNode)
		) {
			setCaret(undefined);
			return;
		}

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
	const observeNaturalTextNode = (node?: HTMLElement): void => {
		if (observedNaturalTextNode !== node) {
			if (observedNaturalTextNode) contentHeightObserver?.unobserve(observedNaturalTextNode);
			observedNaturalTextNode = node;
		}
		if (node && !hasPositionedElements()) contentHeightObserver?.observe(node);
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
		if (context) context.font = font;
		return (context?.measureText(run.text).width ?? run.text.length * 8 * scale) + Math.max(0, [...run.text].length - 1) * current.letterSpacing;
	};

	const layout = createMemo<TextFlowLayout>(() => {
		const currentMetrics = metrics();
		if (!hasPositionedElements()) {
			return {
				fragments: [],
				lineCount: 1,
				height: Math.max(currentMetrics.lineHeight, height()),
			};
		}
		if (!props.editable) {
			const formatted = layoutFormattedText({
				text: draft(), x: x(), y: y(), width: width(), lineHeight: currentMetrics.lineHeight,
				elements: props.wraps(), imageMargin: IMAGE_TEXT_MARGIN,
				measureRun: measureFormattedRun, displayText,
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
		return {
			...currentLayout,
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
			fragments: hasPositionedElements() ? layout().fragments : undefined,
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
			if (!naturalTextNode || hasPositionedElements()) return;
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
		const noteId = props.element().id;
		const editable = props.editable || Boolean(props.locked);
		const root = contentRoot();
		if (!root || (noteId === enteredNoteId && editable === enteredEditable)) return;

		enteredNoteId = noteId;
		enteredEditable = editable;
		if (noteEntryFrame !== undefined) cancelAnimationFrame(noteEntryFrame);
		noteEntryFrame = requestAnimationFrame(() => {
			noteEntryFrame = undefined;
			const currentRoot = contentRoot();
			const viewport = currentRoot?.closest<HTMLElement>("[data-omega-scroll-viewport]");
			if (!currentRoot?.isConnected) return;

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
				if (!currentRoot.isConnected || document.activeElement !== currentRoot) return;
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
		const hasWraps = hasPositionedElements();
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
		if (!hasPositionedElements()) return;
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

	const emitText = (text: string, caret?: number): void => {
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
		if (text !== props.element().text) props.onChange({ ...props.element(), text });
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

	const replaceSelection = (
		replacement: string,
		range = selectionOffsets(),
	): void => {
		const { start, end } = range;
		const rawValue = contentRoot()?.textContent ?? draft();
		const value = hasPositionedElements() ? rawValue.replaceAll(EMPTY_CHARACTER, "") : stripEmptyCharacter(rawValue);
		const normalizedReplacement = replacement.replaceAll(EMPTY_CHARACTER, "");
		const next = value.slice(0, start) + normalizedReplacement + value.slice(end);
		emitText(next, start + normalizedReplacement.length);
	};

	const processInput = (preserveCaret = true): void => {
		if (composing) return;
		const root = contentRoot();
		if (!root) return;
		const rawText = root.textContent ?? "";
		const text = hasPositionedElements() ? rawText.replaceAll(EMPTY_CHARACTER, "") : stripEmptyCharacter(rawText);
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

		const fragments = [...root.querySelectorAll<HTMLElement>("[data-text-fragment]")];
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
		return { node, offset: nearestOffset };
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
		rememberedSelection = selectionOffsets();
		flushInput(false);
		setCaret(undefined);
	};

	const handlePointerDown = (event: PointerEvent): void => {
		if (!props.editable || event.button !== 0) return;
		const root = contentRoot();
		if (!root?.isContentEditable) return;

		if (hasPositionedElements()) {
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

	const handleKeyDown = (event: KeyboardEvent): void => {
		if (composing || event.isComposing) return;
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
		event.preventDefault();
		const text = event.clipboardData?.getData("text/plain");
		if (text !== undefined) replaceSelection(text);
	};

	const handleCompositionEnd = (): void => {
		composing = false;
		handleInput();
	};

	const setNaturalTextNode = (element: HTMLElement): void => {
		naturalTextNode = element;
	};

	const applyFormatting: TextFormatHandler = (format) => {
		const root = contentRoot();
		if (!props.editable || !root || composing) return;
		const selection = getSelection();
		const range = selection?.anchorNode && root.contains(selection.anchorNode)
			? selectionOffsets()
			: rememberedSelection ?? { start: draft().length, end: draft().length };
		const result = formatSelection(draft(), range, format);
		emitText(result.text, result.selection.start);
		const anchor = findTextPosition(root, result.selection.start);
		const focus = findTextPosition(root, result.selection.end);
		if (anchor && focus && selection) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		rememberedSelection = result.selection;
	};
	onMount(() => props.onFormattingReady?.(applyFormatting));

	onCleanup(() => {
		props.onFormattingReady?.(undefined);
		if (caretFrame !== undefined) cancelAnimationFrame(caretFrame);
		if (caretRenderFrame !== undefined) cancelAnimationFrame(caretRenderFrame);
		if (noteEntryFrame !== undefined) cancelAnimationFrame(noteEntryFrame);
		if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
		if (contentHeightFrame !== undefined) cancelAnimationFrame(contentHeightFrame);
		contentHeightObserver?.disconnect();
	});

	return {
		layout,
		caret,
		hasPositionedElements,
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
		startComposition: () => (composing = true),
		handleCompositionEnd,
	};
};
