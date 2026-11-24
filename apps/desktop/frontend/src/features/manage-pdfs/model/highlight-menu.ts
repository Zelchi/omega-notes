import type { PdfHighlightRect } from "../api/pdfs.repository";

export type PdfHighlightTextMenu = {
	text: string;
	selection?: { text: string; rects: PdfHighlightRect[] };
	highlightId?: string;
	page: number;
	x: number;
	y: number;
	mode: "actions" | "edit";
};

type PdfHighlightMenuInput = {
	selection: { text: string; rects: PdfHighlightRect[] } | undefined;
	existingHighlight?: { id: string; text: string };
	page: number;
	cursorX: number;
	cursorY: number;
	host: { scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number };
	hostBounds: { left: number; top: number };
};

export const createPdfHighlightMenu = ({
	selection,
	existingHighlight,
	page,
	cursorX,
	cursorY,
	host,
	hostBounds,
}: PdfHighlightMenuInput): PdfHighlightTextMenu | undefined => {
	if (!selection && !existingHighlight) return undefined;

	const menuWidth = 208;
	const menuHeight = existingHighlight ? 152 : 116;
	return {
		text: selection?.text ?? existingHighlight!.text,
		selection: existingHighlight ? undefined : selection,
		highlightId: existingHighlight?.id,
		page,
		x: Math.max(
			host.scrollLeft + 8,
			Math.min(cursorX - hostBounds.left + host.scrollLeft, host.scrollLeft + host.clientWidth - menuWidth - 8),
		),
		y: Math.max(
			host.scrollTop + 8,
			Math.min(cursorY - hostBounds.top + host.scrollTop, host.scrollTop + host.clientHeight - menuHeight - 8),
		),
		mode: "actions",
	};
};
