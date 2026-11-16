export const sidePanelWidth = 420;
export const sidePanelViewportGutter = 24;
const sidePanelGap = 16;
const sidePanelViewportEdgeSpace = 2;

export const getSidePanelWidthLimits = (viewportWidth: number) => {
	const minWidth = Math.max(0, Math.min(sidePanelWidth, viewportWidth - sidePanelViewportGutter));
	const maxWidth = Math.max(minWidth, viewportWidth - sidePanelWidth - sidePanelGap - sidePanelViewportEdgeSpace);
	return { minWidth, maxWidth };
};

export const sidePanelFrame = {
	boxSizing: "border-box" as const,
	width: `min(${sidePanelWidth}px, calc(100vw - ${sidePanelViewportGutter}px))`,
	maxWidth: `calc(100vw - ${sidePanelViewportGutter}px)`,
};
