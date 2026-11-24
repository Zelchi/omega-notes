export const filterPdfDocuments = <T extends { title: string }>(documents: readonly T[], query: string): T[] => {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	return documents.filter(document => document.title.toLocaleLowerCase().includes(normalizedQuery));
};

export const createPdfLibrarySearchInputHandler = (
	setSearch: (value: string) => void,
	setPage: (page: number) => void,
) => (event: { currentTarget: { value: string } }) => {
	setSearch(event.currentTarget.value);
	setPage(0);
};

export const getPdfLibraryPageSize = (listHeight: number): number =>
	Math.max(1, Math.floor((Math.max(0, listHeight) + 8) / 90));

export const getPdfLibraryPageCount = (itemCount: number, pageSize: number): number =>
	Math.max(1, Math.ceil(Math.max(0, itemCount) / Math.max(1, Math.floor(pageSize))));

export const getPdfLibraryPageItems = <T,>(items: readonly T[], page: number, pageSize: number): T[] => {
	const size = Math.max(1, Math.floor(pageSize));
	const start = Math.max(0, Math.floor(page)) * size;
	return items.slice(start, start + size);
};

export const clampPdfLibraryPage = (page: number, pageCount: number): number =>
	Math.max(0, Math.min(Math.floor(page), Math.max(0, Math.floor(pageCount) - 1)));

export const parsePdfLibraryPageInput = (value: string, pageCount: number): number | undefined => {
	const target = Number(value);
	return Number.isInteger(target) && target >= 1 && target <= pageCount ? target - 1 : undefined;
};

export const createPdfLibraryPageJumpController = (options: {
	page: () => number;
	pageCount: () => number;
	pageJumpOpen: () => boolean;
	pageJumpValue: () => string;
	setPageJumpOpen: (open: boolean) => void;
	setPageJumpValue: (value: string) => void;
	setPage: (page: number) => void;
}) => ({
	open: () => {
		options.setPageJumpValue(String(options.page() + 1));
		options.setPageJumpOpen(true);
	},
	goToPage: () => {
		if (!options.pageJumpOpen()) return;
		const target = parsePdfLibraryPageInput(options.pageJumpValue(), options.pageCount());
		options.setPageJumpOpen(false);
		if (target !== undefined) options.setPage(target);
	},
});
