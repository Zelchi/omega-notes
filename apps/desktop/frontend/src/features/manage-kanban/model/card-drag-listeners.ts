type CardDragEventHandlers = {
	move: (event: PointerEvent) => void;
	up: (event: PointerEvent) => void;
	cancel: (event: PointerEvent) => void;
	blur: () => void;
};

export const installKanbanCardDragListeners = (
	handlers: CardDragEventHandlers,
	target: EventTarget = window,
): (() => void) => {
	const move = (event: Event) => handlers.move(event as PointerEvent);
	const up = (event: Event) => handlers.up(event as PointerEvent);
	const cancel = (event: Event) => handlers.cancel(event as PointerEvent);
	target.addEventListener("pointermove", move, { capture: true, passive: false });
	target.addEventListener("pointerup", up, true);
	target.addEventListener("pointercancel", cancel, true);
	target.addEventListener("blur", handlers.blur);

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		target.removeEventListener("pointermove", move, true);
		target.removeEventListener("pointerup", up, true);
		target.removeEventListener("pointercancel", cancel, true);
		target.removeEventListener("blur", handlers.blur);
	};
};
