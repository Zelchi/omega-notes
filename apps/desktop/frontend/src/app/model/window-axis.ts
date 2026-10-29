type AxisSizes = { width: number; height: number; workWidth: number; workHeight: number };

export const occupiesWindowAxis = (sizes: AxisSizes | null, isLinux: boolean): boolean => {
	if (!sizes || ![sizes.width, sizes.height, sizes.workWidth, sizes.workHeight].every((size) => Number.isFinite(size) && size > 0)) return false;
	// shortcut: Linux sizes within 5% of the work area count as tiled; use compositor state if available.
	const occupies = (size: number, workSize: number) =>
		size >= workSize - Math.max(16, isLinux ? workSize * 0.05 : 0);
	return occupies(sizes.width, sizes.workWidth) || occupies(sizes.height, sizes.workHeight);
};
