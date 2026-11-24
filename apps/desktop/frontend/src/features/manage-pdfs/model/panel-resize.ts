import { clampPdfPanelWidth } from "./panel-size";

type ResizeStart = {
	enabled: boolean;
	button: number;
	pointerId: number;
	clientX: number;
	panelWidth: number;
};

type ResizeMove = {
	pointerId: number;
	clientX: number;
	viewportWidth: number;
};

export const createPdfPanelResizeController = (setWidth: (width: number) => void) => {
	let gesture: { pointerId: number; startX: number; startWidth: number } | undefined;

	const start = ({ enabled, button, pointerId, clientX, panelWidth }: ResizeStart) => {
		if (!enabled || button !== 0) return false;
		gesture = { pointerId, startX: clientX, startWidth: panelWidth };
		return true;
	};

	const move = ({ pointerId, clientX, viewportWidth }: ResizeMove) => {
		if (!gesture || gesture.pointerId !== pointerId) return false;
		setWidth(clampPdfPanelWidth(gesture.startWidth + gesture.startX - clientX, viewportWidth));
		return true;
	};

	const stop = (sample: ResizeMove) => {
		if (!move(sample)) return false;
		gesture = undefined;
		return true;
	};

	return { start, move, stop };
};

type PdfPanelResizePointerDownEvent = {
	button: number;
	pointerId: number;
	clientX: number;
	currentTarget: { setPointerCapture: (pointerId: number) => void };
	preventDefault: () => void;
	stopPropagation: () => void;
};
type PdfPanelResizePointerEvent = {
	pointerId: number;
	clientX: number;
	preventDefault: () => void;
};

export const createPdfPanelResizeHandlers = (options: {
	controller: ReturnType<typeof createPdfPanelResizeController>;
	isEnabled: () => boolean;
	getPanelWidth: () => number;
	getPanelElement: () => { getBoundingClientRect: () => { width: number } } | undefined;
	getViewportWidth: () => number;
}) => {
	const start = (event: PdfPanelResizePointerDownEvent) => {
		const started = options.controller.start({
			enabled: options.isEnabled(),
			button: event.button,
			pointerId: event.pointerId,
			clientX: event.clientX,
			panelWidth: options.getPanelElement()?.getBoundingClientRect().width ?? options.getPanelWidth(),
		});
		if (!started) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const move = (event: PdfPanelResizePointerEvent) => {
		if (options.controller.move({
			pointerId: event.pointerId,
			clientX: event.clientX,
			viewportWidth: options.getViewportWidth(),
		})) event.preventDefault();
	};
	const stop = (event: PdfPanelResizePointerEvent) => {
		if (options.controller.stop({
			pointerId: event.pointerId,
			clientX: event.clientX,
			viewportWidth: options.getViewportWidth(),
		})) event.preventDefault();
	};
	return { start, move, stop };
};
