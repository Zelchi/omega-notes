import { getSidePanelWidthLimits } from "@/shared/lib/side-panel-layout";

export const getPdfPanelWidthLimits = getSidePanelWidthLimits;

export const clampPdfPanelWidth = (width: number, viewportWidth: number): number => {
	const { minWidth, maxWidth } = getPdfPanelWidthLimits(viewportWidth);
	return Math.max(minWidth, Math.min(maxWidth, width));
};
