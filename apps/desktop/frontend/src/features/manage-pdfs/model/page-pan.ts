type ScrollViewport = { scrollLeft: number; scrollTop: number };
type PointerPosition = { x: number; y: number };

type FreePanSample = {
	viewport: ScrollViewport;
	pointerType: string;
	pointerLocked: boolean;
	clientX: number;
	clientY: number;
	altKey: boolean;
	buttons: number;
	overContextMenu: boolean;
};

type LockedPanSample = {
	viewport: ScrollViewport;
	pointerLocked: boolean;
	altKey: boolean;
	movementX: number;
	movementY: number;
};

export const createPdfReaderPanController = (setActive: (active: boolean) => void) => {
	let previous: PointerPosition | undefined;

	const activate = () => setActive(true);

	const move = (sample: FreePanSample) => {
		if (sample.pointerType !== "mouse" || sample.pointerLocked) return;
		const prior = previous;
		previous = { x: sample.clientX, y: sample.clientY };
		const active = sample.altKey && sample.buttons === 0 && !sample.overContextMenu;
		setActive(active);
		if (!active || !prior) return;
		sample.viewport.scrollLeft += sample.clientX - prior.x;
		sample.viewport.scrollTop += sample.clientY - prior.y;
	};

	const moveLocked = (sample: LockedPanSample) => {
		if (!sample.altKey || !sample.pointerLocked) return;
		sample.viewport.scrollLeft += sample.movementX;
		sample.viewport.scrollTop += sample.movementY;
	};

	const resetPointer = () => {
		previous = undefined;
	};

	const finish = () => {
		resetPointer();
		setActive(false);
	};

	return { activate, move, moveLocked, resetPointer, finish };
};

type PointerMoveEvent = {
	currentTarget: ScrollViewport;
	pointerType: string;
	clientX: number;
	clientY: number;
	altKey: boolean;
	buttons: number;
	target: EventTarget | null;
};
type MouseMoveEvent = {
	currentTarget: ScrollViewport;
	altKey: boolean;
	movementX: number;
	movementY: number;
};

export const createPdfReaderPanHandlers = (
	controller: Pick<ReturnType<typeof createPdfReaderPanController>, "move" | "moveLocked">,
	options: {
		isPointerLocked: (viewport: ScrollViewport) => boolean;
		isOverContextMenu: (target: EventTarget | null) => boolean;
	},
) => ({
	move: (event: PointerMoveEvent) => controller.move({
		viewport: event.currentTarget,
		pointerType: event.pointerType,
		pointerLocked: options.isPointerLocked(event.currentTarget),
		clientX: event.clientX,
		clientY: event.clientY,
		altKey: event.altKey,
		buttons: event.buttons,
		overContextMenu: options.isOverContextMenu(event.target),
	}),
	moveLocked: (event: MouseMoveEvent) => controller.moveLocked({
		viewport: event.currentTarget,
		pointerLocked: options.isPointerLocked(event.currentTarget),
		altKey: event.altKey,
		movementX: event.movementX,
		movementY: event.movementY,
	}),
});
