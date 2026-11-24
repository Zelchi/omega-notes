export const isZipTieModifierGesture = (
	event: Pick<PointerEvent, "shiftKey" | "ctrlKey" | "metaKey">,
): boolean => event.shiftKey && !event.ctrlKey && !event.metaKey;

export const getZipTieStrokeOutcome = (noteId: string | undefined, distance: number) => ({
	suppressClick: Boolean(noteId) || distance >= 4,
	toggleNoteSelection: Boolean(noteId) && distance < 4,
});
