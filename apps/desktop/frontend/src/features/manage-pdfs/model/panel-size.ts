import { sidePanelViewportGutter, sidePanelWidth } from "@/shared/lib/side-panel-layout";

export const getPdfPanelWidthLimits = (viewportWidth: number) => {
	const maxWidth = Math.max(0, viewportWidth - sidePanelViewportGutter);
	return { minWidth: Math.min(sidePanelWidth, maxWidth), maxWidth };
};

export const clampPdfPanelWidth = (width: number, viewportWidth: number): number => {
	const { minWidth, maxWidth } = getPdfPanelWidthLimits(viewportWidth);
	return Math.max(minWidth, Math.min(maxWidth, width));
};
