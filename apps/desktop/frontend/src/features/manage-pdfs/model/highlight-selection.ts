import { maxPdfHighlightRects, maxPdfHighlightTextLength, type PdfHighlight, type PdfHighlightRect } from "../api/pdfs.repository";

type ClientRectBounds = { left: number; top: number; right: number; bottom: number };

export const getPdfSelectionData = (
	textLayerContainer: HTMLDivElement,
	selection: Selection | null,
): { text: string; rects: PdfHighlightRect[] } | undefined => {
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

export const getPdfHighlightAt = (
	highlights: PdfHighlight[], page: number, textLayerContainer: HTMLDivElement, clientX: number, clientY: number,
): PdfHighlight | undefined => {
	const bounds = textLayerContainer.getBoundingClientRect();
	if (bounds.width < 1 || bounds.height < 1) return;
	const x = (clientX - bounds.left) / bounds.width;
	const y = (clientY - bounds.top) / bounds.height;
	return highlights.find(highlight => highlight.page === page
		&& highlight.rects.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
};
