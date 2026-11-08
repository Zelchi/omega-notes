import { invoke, isDesktopRuntime } from "@/shared/lib/desktop";

export const maxPdfTitleLength = 500;
export const maxPdfBytes = 512 * 1024 * 1024;
export const maxPdfHighlights = 1000;
export const maxPdfHighlightTextLength = 10_000;
export const maxPdfHighlightRects = 500;
export const pdfHighlightColors = ["yellow", "green", "blue", "pink", "purple"] as const;
export type PdfHighlightColor = typeof pdfHighlightColors[number];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PdfDocument = {
	id: string;
	title: string;
	sizeBytes: number;
	importedAt: number;
	lastPage: number;
	pageCount: number;
};

export type PdfHighlightRect = { x: number; y: number; width: number; height: number };
export type PdfHighlight = { id: string; page: number; text: string; rects: PdfHighlightRect[]; color: PdfHighlightColor; noteId: string | null };

const decodePdfHighlight = (value: unknown): PdfHighlight => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PDF_HIGHLIGHTS_INVALID");
	const highlight = value as Record<string, unknown>;
	if (typeof highlight.id !== "string" || !uuidPattern.test(highlight.id)
		|| typeof highlight.page !== "number" || !Number.isSafeInteger(highlight.page) || highlight.page < 1 || highlight.page > 1_000_000
		|| typeof highlight.text !== "string" || !highlight.text.trim() || Array.from(highlight.text).length > maxPdfHighlightTextLength
		|| !Array.isArray(highlight.rects) || highlight.rects.length < 1 || highlight.rects.length > maxPdfHighlightRects) {
		throw Error("PDF_HIGHLIGHTS_INVALID");
	}
	const color = highlight.color === undefined ? "yellow" : highlight.color;
	if (typeof color !== "string" || !pdfHighlightColors.includes(color as PdfHighlightColor)) throw Error("PDF_HIGHLIGHTS_INVALID");
	const noteId = highlight.noteId === undefined || highlight.noteId === null ? null : highlight.noteId;
	if (noteId !== null && (typeof noteId !== "string" || !uuidPattern.test(noteId))) throw Error("PDF_HIGHLIGHTS_INVALID");
	const rects = highlight.rects.map(value => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PDF_HIGHLIGHTS_INVALID");
		const rect = value as Record<string, unknown>;
		if (typeof rect.x !== "number" || !Number.isFinite(rect.x) || rect.x < 0
			|| typeof rect.y !== "number" || !Number.isFinite(rect.y) || rect.y < 0
			|| typeof rect.width !== "number" || !Number.isFinite(rect.width) || rect.width <= 0
			|| typeof rect.height !== "number" || !Number.isFinite(rect.height) || rect.height <= 0
			|| rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001) throw Error("PDF_HIGHLIGHTS_INVALID");
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	});
	return { id: highlight.id, page: highlight.page, text: highlight.text, rects, color: color as PdfHighlightColor, noteId: noteId as string | null };
};

export const decodePdfHighlights = (value: unknown): PdfHighlight[] => {
	if (!Array.isArray(value) || value.length > maxPdfHighlights) throw Error("PDF_HIGHLIGHTS_INVALID");
	const ids = new Set<string>();
	return value.map(entry => {
		const highlight = decodePdfHighlight(entry);
		if (ids.has(highlight.id)) throw Error("PDF_HIGHLIGHTS_INVALID");
		ids.add(highlight.id);
		return highlight;
	});
};

const decodePdfDocument = (value: unknown): PdfDocument => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PDF_STORAGE_FAILED");
	const document = value as Record<string, unknown>;
	if (typeof document.id !== "string" || !uuidPattern.test(document.id)
		|| typeof document.title !== "string" || !document.title.trim() || Array.from(document.title).length > maxPdfTitleLength
		|| typeof document.sizeBytes !== "number" || !Number.isSafeInteger(document.sizeBytes) || document.sizeBytes < 1 || document.sizeBytes > maxPdfBytes
		|| typeof document.importedAt !== "number" || !Number.isSafeInteger(document.importedAt) || document.importedAt < 0
		|| typeof document.lastPage !== "number" || !Number.isSafeInteger(document.lastPage) || document.lastPage < 1
		|| typeof document.pageCount !== "number" || !Number.isSafeInteger(document.pageCount) || document.pageCount < 0 || document.pageCount > 1_000_000
		|| (document.pageCount > 0 && document.lastPage > document.pageCount)) throw Error("PDF_STORAGE_FAILED");
	return {
		id: document.id,
		title: document.title,
		sizeBytes: document.sizeBytes,
		importedAt: document.importedAt,
		lastPage: document.lastPage,
		pageCount: document.pageCount,
	};
};

export const decodePdfDocuments = (value: unknown): PdfDocument[] => {
	if (!Array.isArray(value) || value.length > 1000) throw Error("PDF_STORAGE_FAILED");
	const ids = new Set<string>();
	return value.map(entry => {
		const document = decodePdfDocument(entry);
		if (ids.has(document.id)) throw Error("PDF_STORAGE_FAILED");
		ids.add(document.id);
		return document;
	});
};

const requireDesktop = (): void => {
	if (!isDesktopRuntime()) throw Error("DESKTOP_UNAVAILABLE");
};

export const readPdfDocuments = async (vaultId: string): Promise<PdfDocument[]> => {
	requireDesktop();
	return decodePdfDocuments(await invoke<unknown>("read_pdf_documents", { vaultId }));
};

export const importPdfDocument = async (vaultId: string, sourcePath: string, title: string): Promise<PdfDocument> => {
	requireDesktop();
	return decodePdfDocument(await invoke<unknown>("import_pdf_document", { vaultId, sourcePath, title }));
};

export const renamePdfDocument = async (vaultId: string, documentId: string, title: string): Promise<PdfDocument[]> => {
	requireDesktop();
	return decodePdfDocuments(await invoke<unknown>("rename_pdf_document", { vaultId, documentId, title }));
};

export const deletePdfDocument = async (vaultId: string, documentId: string): Promise<PdfDocument[]> => {
	requireDesktop();
	return decodePdfDocuments(await invoke<unknown>("delete_pdf_document", { vaultId, documentId }));
};

export const savePdfProgress = (vaultId: string, documentId: string, page: number, pageCount: number): Promise<void> => {
	requireDesktop();
	return invoke("save_pdf_progress", { vaultId, documentId, page, pageCount });
};

export const readPdfHighlights = async (vaultId: string, documentId: string): Promise<PdfHighlight[]> => {
	requireDesktop();
	return decodePdfHighlights(await invoke<unknown>("read_pdf_highlights", { vaultId, documentId }));
};

export const addPdfHighlight = async (vaultId: string, documentId: string, highlight: PdfHighlight): Promise<PdfHighlight[]> => {
	requireDesktop();
	return decodePdfHighlights(await invoke<unknown>("add_pdf_highlight", { vaultId, documentId, highlight }));
};

export const updatePdfHighlight = async (vaultId: string, documentId: string, highlight: PdfHighlight): Promise<PdfHighlight[]> => {
	requireDesktop();
	return decodePdfHighlights(await invoke<unknown>("update_pdf_highlight", { vaultId, documentId, highlight }));
};

export const deletePdfHighlight = async (vaultId: string, documentId: string, highlightId: string): Promise<PdfHighlight[]> => {
	requireDesktop();
	return decodePdfHighlights(await invoke<unknown>("delete_pdf_highlight", { vaultId, documentId, highlightId }));
};

export const getPdfDocumentStreamUrl = (vaultId: string, documentId: string): Promise<string> => {
	requireDesktop();
	return invoke("pdf_document_stream_url", { vaultId, documentId });
};
