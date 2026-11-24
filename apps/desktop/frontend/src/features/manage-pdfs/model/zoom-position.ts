import { getPdfZoomScrollAdjustment, getPdfZoomTarget, minPdfZoom, type PdfPageBounds, type PdfZoomAnchor } from "./reader-controls";

type PdfReaderZoomAnchor = PdfZoomAnchor & { page: number };
type PdfReaderZoomHost = {
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
	clientWidth: number;
};

const getPdfReaderZoomAnchor = (
	page: number,
	bounds: PdfPageBounds | undefined,
	point: { clientX: number; clientY: number },
): PdfReaderZoomAnchor | undefined => {
	if (!bounds || bounds.width < 1 || bounds.height < 1
		|| point.clientX < bounds.left || point.clientX > bounds.left + bounds.width
		|| point.clientY < bounds.top || point.clientY > bounds.top + bounds.height) return;
	return {
		page,
		x: (point.clientX - bounds.left) / bounds.width,
		y: (point.clientY - bounds.top) / bounds.height,
		clientX: point.clientX,
		clientY: point.clientY,
	};
};

export const findPdfReaderZoomAnchor = <Element>(
	pages: Iterable<[number, Element]>,
	getBounds: (element: Element) => PdfPageBounds | undefined,
	point: { clientX: number; clientY: number },
): PdfReaderZoomAnchor | undefined => {
	for (const [page, element] of pages) {
		const anchor = getPdfReaderZoomAnchor(page, getBounds(element), point);
		if (anchor) return anchor;
	}
};

export const createPdfReaderZoomController = ({
	getZoom,
	setZoom,
	getHost,
	getPageBounds,
}: {
	getZoom: () => number;
	setZoom: (zoom: number) => void;
	getHost: () => PdfReaderZoomHost | undefined;
	getPageBounds: (page: number) => PdfPageBounds | undefined;
}) => {
	let anchor: PdfReaderZoomAnchor | undefined;
	let centerHorizontalScrollOnRender = false;

	const change = (delta: number, nextAnchor?: PdfReaderZoomAnchor) => {
		const current = getZoom();
		const next = getPdfZoomTarget(current, delta);
		if (next === current) return false;
		anchor = nextAnchor;
		centerHorizontalScrollOnRender = !nextAnchor;
		setZoom(next);
		return true;
	};

	const restoreAfterRender = () => {
		const pendingAnchor = anchor;
		anchor = undefined;
		const host = getHost();
		if (pendingAnchor && host) {
			const bounds = getPageBounds(pendingAnchor.page);
			if (bounds) {
				const adjustment = getPdfZoomScrollAdjustment(bounds, pendingAnchor);
				host.scrollLeft += adjustment.left;
				host.scrollTop += adjustment.top;
				return;
			}
		}
		if (centerHorizontalScrollOnRender && host) {
			host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
			centerHorizontalScrollOnRender = false;
		}
	};

	const clearAnchor = () => {
		anchor = undefined;
	};

	const resetDocument = () => {
		anchor = undefined;
		centerHorizontalScrollOnRender = false;
	};

	return {
		change,
		reset: () => change(minPdfZoom - getZoom()),
		restoreAfterRender,
		clearAnchor,
		resetDocument,
	};
};
