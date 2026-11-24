export const beginCanvasNotePointerInteraction = (options: {
	noteId: string;
	button: number;
	isOnNote: boolean;
	shouldIgnoreClick: () => boolean;
	preloadNote: (noteId: string) => void;
	beginGesture: () => void;
}) => {
	if (options.button === 0 && options.isOnNote && !options.shouldIgnoreClick()) {
		options.preloadNote(options.noteId);
	}
	options.beginGesture();
};
