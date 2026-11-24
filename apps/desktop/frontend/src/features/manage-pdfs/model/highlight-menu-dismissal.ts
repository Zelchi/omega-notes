type PdfHighlightMenuDismissalOptions = {
	windowTarget: EventTarget;
	isInsideMenu: (target: EventTarget | null) => boolean;
	isSuggestionInput: (target: EventTarget | null) => boolean;
	suggestionsOpen: () => boolean;
	closeMenu: () => void;
};

export const observePdfHighlightMenuDismissal = (options: PdfHighlightMenuDismissalOptions) => {
	const outsidePointerDown = (event: Event) => {
		if (!options.isInsideMenu(event.target)) options.closeMenu();
	};
	const keyDown = (event: Event) => {
		const keyboardEvent = event as KeyboardEvent;
		if (keyboardEvent.key !== "Escape") return;
		if (options.isSuggestionInput(keyboardEvent.target) && options.suggestionsOpen()) return;
		keyboardEvent.preventDefault();
		keyboardEvent.stopImmediatePropagation();
		options.closeMenu();
	};

	options.windowTarget.addEventListener("pointerdown", outsidePointerDown);
	options.windowTarget.addEventListener("keydown", keyDown, true);
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		options.windowTarget.removeEventListener("pointerdown", outsidePointerDown);
		options.windowTarget.removeEventListener("keydown", keyDown, true);
	};
};
