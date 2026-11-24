export type PdfSuggestionAnchor = { left: number; top: number; height: number };

type PdfSuggestionAnchorOptions = {
	getInput: () => {
		isConnected: boolean;
		getBoundingClientRect: () => Pick<DOMRect, "left" | "top" | "width" | "height">;
	} | undefined;
	windowTarget: EventTarget;
	scrollTarget?: EventTarget;
	setAnchor: (anchor: PdfSuggestionAnchor) => void;
	requestFrame: (callback: () => void) => number;
	cancelFrame: (frame: number) => void;
};

export const getPdfSuggestionAnchor = (
	input: ReturnType<PdfSuggestionAnchorOptions["getInput"]>,
): PdfSuggestionAnchor | undefined => {
	if (!input?.isConnected) return;
	const bounds = input.getBoundingClientRect();
	return { left: bounds.left + bounds.width / 2, top: bounds.top, height: bounds.height };
};

export const observePdfSuggestionAnchor = (options: PdfSuggestionAnchorOptions) => {
	let frame: number | undefined;
	const update = () => {
		const anchor = getPdfSuggestionAnchor(options.getInput());
		if (anchor) options.setAnchor(anchor);
	};
	const schedule = () => {
		if (frame !== undefined) options.cancelFrame(frame);
		frame = options.requestFrame(update);
	};

	update();
	options.windowTarget.addEventListener("resize", schedule);
	options.scrollTarget?.addEventListener("scroll", schedule);
	return () => {
		if (frame !== undefined) options.cancelFrame(frame);
		options.windowTarget.removeEventListener("resize", schedule);
		options.scrollTarget?.removeEventListener("scroll", schedule);
	};
};
