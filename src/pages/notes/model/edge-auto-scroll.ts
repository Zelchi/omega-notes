const EDGE_SIZE = 72;
const MAX_SCROLL_SPEED = 520;

export const createEdgeAutoScroll = (getViewport: () => HTMLElement | undefined) => {
	let pointerY: number | undefined;
	let frame: number | undefined;
	let previousFrameTime = 0;

	const stop = (): void => {
		pointerY = undefined;
		previousFrameTime = 0;
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	};

	const update = (time: number): void => {
		frame = undefined;
		const viewport = getViewport();
		if (!viewport || pointerY === undefined) return;

		const bounds = viewport.getBoundingClientRect();
		const edgeSize = Math.min(EDGE_SIZE, bounds.height / 3);
		let intensity = 0;
		if (pointerY < bounds.top + edgeSize) {
			intensity = -Math.min(1, (bounds.top + edgeSize - pointerY) / edgeSize);
		} else if (pointerY > bounds.bottom - edgeSize) {
			intensity = Math.min(1, (pointerY - (bounds.bottom - edgeSize)) / edgeSize);
		}

		if (intensity === 0) {
			previousFrameTime = 0;
			return;
		}

		const elapsed = previousFrameTime ? Math.min(time - previousFrameTime, 32) : 16;
		previousFrameTime = time;
		const previousScrollTop = viewport.scrollTop;
		viewport.scrollTop += intensity * MAX_SCROLL_SPEED * (elapsed / 1000);
		if (viewport.scrollTop !== previousScrollTop) frame = requestAnimationFrame(update);
		else previousFrameTime = 0;
	};

	const updatePointer = (clientY: number): void => {
		pointerY = clientY;
		if (frame === undefined) {
			previousFrameTime = 0;
			frame = requestAnimationFrame(update);
		}
	};

	return { updatePointer, stop };
};
