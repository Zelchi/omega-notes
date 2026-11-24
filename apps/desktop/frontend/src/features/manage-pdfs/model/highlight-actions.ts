import type { PdfHighlight, PdfHighlightColor, PdfHighlightRect } from "../api/pdfs.repository";
import type { TranslationKey } from "@/shared/lib/i18n";

type SelectionMenu = { page: number; selection?: { text: string; rects: PdfHighlightRect[] } };
type HighlightActionsOptions = {
	vaultId: () => string | undefined;
	documentId: () => string;
	revision: () => number;
	menu: () => SelectionMenu | undefined;
	readyPages: () => Set<number>;
	highlights: () => PdfHighlight[];
	saving: () => boolean;
	editColor: () => PdfHighlightColor;
	editNoteId: () => string;
	setSaving: (saving: boolean) => void;
	setError: (error: TranslationKey | undefined) => void;
	setHighlights: (highlights: PdfHighlight[]) => void;
	setSelected: (id: string | undefined) => void;
	closeMenu: () => void;
	clearSelection: () => void;
	createId: () => string;
	add: (vault: string, document: string, highlight: PdfHighlight) => Promise<PdfHighlight[]>;
	update: (vault: string, document: string, highlight: PdfHighlight) => Promise<PdfHighlight[]>;
	remove: (vault: string, document: string, id: string) => Promise<PdfHighlight[]>;
};

export const createPdfHighlightActions = (options: HighlightActionsOptions) => {
	const saveSelectionAsHighlight = async () => {
		const vaultId = options.vaultId();
		const menu = options.menu();
		const selected = menu?.selection;
		if (!vaultId || !menu || !selected || !options.readyPages().has(menu.page) || options.saving()) return;
		const documentId = options.documentId();
		const revision = options.revision();
		const highlight: PdfHighlight = { id: options.createId(), page: menu.page, ...selected, color: "yellow", noteId: null };
		options.setSaving(true);
		options.setError(undefined);
		try {
			const saved = await options.add(vaultId, documentId, highlight);
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) {
				options.setHighlights(saved);
				options.setSelected(highlight.id);
				options.closeMenu();
				options.clearSelection();
			}
		} catch {
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) options.setError("pdfHighlightSaveFailed");
		} finally {
			if (revision === options.revision()) options.setSaving(false);
		}
	};
	const saveHighlightEdit = async (highlightId: string) => {
		const vaultId = options.vaultId();
		const highlight = options.highlights().find(item => item.id === highlightId);
		if (!vaultId || !highlight || options.saving()) return;
		const documentId = options.documentId();
		const revision = options.revision();
		const updated = { ...highlight, color: options.editColor(), noteId: options.editNoteId() || null };
		options.setSaving(true);
		options.setError(undefined);
		try {
			const saved = await options.update(vaultId, documentId, updated);
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) {
				options.setHighlights(saved);
				options.setSelected(highlightId);
				options.closeMenu();
			}
		} catch {
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) options.setError("pdfHighlightUpdateFailed");
		} finally {
			if (revision === options.revision()) options.setSaving(false);
		}
	};
	const removeHighlight = async (highlightId: string) => {
		const vaultId = options.vaultId();
		if (!vaultId || options.saving()) return;
		const documentId = options.documentId();
		const revision = options.revision();
		options.setSaving(true);
		options.setError(undefined);
		try {
			const saved = await options.remove(vaultId, documentId, highlightId);
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) {
				options.setHighlights(saved);
				options.setSelected(undefined);
				options.closeMenu();
			}
		} catch {
			if (revision === options.revision() && options.vaultId() === vaultId && options.documentId() === documentId) options.setError("pdfHighlightDeleteFailed");
		} finally {
			if (revision === options.revision()) options.setSaving(false);
		}
	};
	return { saveSelectionAsHighlight, saveHighlightEdit, removeHighlight };
};
