import { getPdfPageNavigationTarget } from "./page-spread";

export const minPdfZoom = 1;
export const maxPdfZoom = 3;
export const pdfZoomStep = 0.1;

export type PdfZoomAnchor = {
	x: number;
	y: number;
	clientX: number;
	clientY: number;
};

export type PdfPageBounds = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export const getPdfZoomTarget = (current: number, delta: number): number =>
	Math.max(minPdfZoom, Math.min(maxPdfZoom, Math.round((current + delta) * 10) / 10));

export const getPdfZoomScrollAdjustment = (bounds: PdfPageBounds, anchor: PdfZoomAnchor) => ({
	left: bounds.left + anchor.x * bounds.width - anchor.clientX,
	top: bounds.top + anchor.y * bounds.height - anchor.clientY,
});

export const handlePdfReaderWheelZoom = <Anchor>(
	event: Pick<WheelEvent, "ctrlKey" | "deltaY" | "preventDefault">,
	pageCount: number,
	getAnchor: () => Anchor | undefined,
	changeZoom: (delta: number, anchor?: Anchor) => void,
) => {
	if (!event.ctrlKey) return;
	event.preventDefault();
	if (!pageCount || event.deltaY === 0) return;
	changeZoom(event.deltaY < 0 ? pdfZoomStep : -pdfZoomStep, getAnchor());
};

export const parsePdfPageJump = (value: string, pageCount: number): number | undefined => {
	const target = Number(value);
	return Number.isInteger(target) && target >= 1 && target <= pageCount ? target : undefined;
};

type PdfReaderNavigationOptions = {
	pageCount: () => number;
	pageNumber: () => number;
	visiblePages: () => number[];
	spreadEnabled: () => boolean;
	busy: () => boolean;
	pageJumpOpen: () => boolean;
	pageJumpValue: () => string;
	setPageJumpOpen: (open: boolean) => void;
	setPageJumpValue: (value: string) => void;
	setPageNumber: (update: (current: number) => number) => void;
	clearZoomAnchor: () => void;
	clearSelectedHighlight: () => void;
	closeTextMenu: () => void;
	clearBrowserSelection: () => void;
};

export const createPdfReaderNavigationController = (options: PdfReaderNavigationOptions) => {
	const clearSelectionState = () => {
		options.clearZoomAnchor();
		options.clearSelectedHighlight();
		options.closeTextMenu();
		options.clearBrowserSelection();
	};

	const movePage = (direction: -1 | 1) => {
		clearSelectionState();
		options.setPageNumber(current => getPdfPageNavigationTarget(
			current,
			options.pageCount(),
			options.spreadEnabled(),
			direction,
		));
	};

	const openPageJump = () => {
		if (!options.pageCount() || options.busy()) return;
		options.setPageJumpValue(String(options.visiblePages()[0] ?? options.pageNumber()));
		options.setPageJumpOpen(true);
	};

	const goToPage = () => {
		if (!options.pageJumpOpen()) return;
		const target = parsePdfPageJump(options.pageJumpValue(), options.pageCount());
		options.setPageJumpOpen(false);
		if (target === undefined) return;
		clearSelectionState();
		options.setPageNumber(() => target);
	};

	return { movePage, openPageJump, goToPage };
};
