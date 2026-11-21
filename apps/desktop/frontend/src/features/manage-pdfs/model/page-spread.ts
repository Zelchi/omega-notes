export const pdfPageSpreadGap = 16;

export const shouldUsePdfPageSpread = (
	viewportWidth: number,
	viewportHeight: number,
	pageAspectRatio: number | undefined,
	pageCount: number,
): boolean => {
	if (pageCount < 2 || !pageAspectRatio || !Number.isFinite(pageAspectRatio)) return false;
	const pageHeight = Math.max(0, viewportHeight - 30);
	const requiredWidth = 32 + pdfPageSpreadGap + pageHeight * pageAspectRatio * 2;
	return viewportWidth >= requiredWidth;
};

export const getPdfPageSpreadPages = (page: number, pageCount: number, enabled: boolean): number[] => {
	if (!enabled) return [Math.max(1, page)];
	const first = 1 + 2 * Math.floor((Math.max(1, page) - 1) / 2);
	if (first >= pageCount) return [pageCount];
	return [first, Math.min(first + 1, pageCount)];
};

export const normalizePdfPageSpreadCursor = (page: number, pageCount: number, enabled: boolean): number => {
	if (!enabled) return page;
	const pages = getPdfPageSpreadPages(page, pageCount, enabled);
	return pages[pages.length - 1] ?? page;
};

export const getPdfPageNavigationTarget = (
	page: number,
	pageCount: number,
	enabled: boolean,
	direction: -1 | 1,
): number => {
	if (!enabled) return Math.max(1, Math.min(pageCount, page + direction));
	const visiblePages = getPdfPageSpreadPages(page, pageCount, enabled);
	if (direction > 0) {
		return Math.min(visiblePages[0] + 3, pageCount);
	}
	if (visiblePages[0] <= 1) return 1;
	return visiblePages[0] - 1;
};

export const getPdfAdjacentPreviewPages = (
	page: number,
	visiblePages: number[],
	pageCount: number,
	spreadEnabled: boolean,
): number[] => {
	if (!spreadEnabled) return [page + 1, page - 1].filter(candidate =>
		candidate >= 1 && candidate <= pageCount && !visiblePages.includes(candidate),
	);
	const firstVisible = visiblePages[0] ?? page;
	const previous = firstVisible <= 1 ? [] : [firstVisible - 2, firstVisible - 1];
	const nextStart = firstVisible + 2;
	return [...previous, nextStart, nextStart + 1].filter(candidate =>
		candidate >= 1 && candidate <= pageCount && !visiblePages.includes(candidate),
	);
};
