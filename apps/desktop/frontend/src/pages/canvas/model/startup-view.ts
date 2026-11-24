type CanvasViewport = { width: number; height: number };
type CanvasBounds = { left: number; top: number; right: number; bottom: number };
type CanvasHomeSize = { width: number; height: number };

export const getCanvasStartupView = (
	viewport: CanvasViewport,
	scale: number,
	bounds: CanvasBounds | undefined,
	homeSize: CanvasHomeSize,
) => {
	if (!bounds) {
		return {
			x: viewport.width / 2 - homeSize.width / 2,
			y: viewport.height / 2 - homeSize.height / 2,
			scale,
		};
	}
	const centerX = (bounds.left + bounds.right) / 2;
	const centerY = (bounds.top + bounds.bottom) / 2;
	return {
		x: viewport.width / 2 - centerX * scale,
		y: viewport.height / 2 - centerY * scale,
		scale,
	};
};
