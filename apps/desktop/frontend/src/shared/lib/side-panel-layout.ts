export const sidePanelWidth = 420;
export const sidePanelViewportGutter = 24;

export const sidePanelFrame = {
	boxSizing: "border-box" as const,
	width: `min(${sidePanelWidth}px, calc(100vw - ${sidePanelViewportGutter}px))`,
	maxWidth: `calc(100vw - ${sidePanelViewportGutter}px)`,
};
