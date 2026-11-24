export const isBackgroundMarkVisible = (density: number, densityLimit: number): boolean =>
	density < densityLimit;

export const getBackgroundDensityLimit = (intensity: number, maximumDensity = 1): number =>
	intensity * maximumDensity;

export const getMatrixRainPosition = (
	column: number,
	columnCount: number,
	viewportWidth: number,
	viewportHeight: number,
	phase: number,
	duration: number,
	hostBounds: { left: number; top: number },
) => ({
	x: column / columnCount * viewportWidth - hostBounds.left,
	y: -12 + phase / duration * viewportHeight - hostBounds.top,
});
