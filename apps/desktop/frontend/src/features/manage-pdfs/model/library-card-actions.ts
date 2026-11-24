export const togglePdfCardActions = (currentId: string | undefined, id: string): string | undefined =>
	currentId === id ? undefined : id;

export const handlePdfCardContextMenu = (
	event: Pick<MouseEvent, "preventDefault" | "stopPropagation">,
	editing: boolean,
	toggle: () => void,
): void => {
	if (editing) return;
	event.preventDefault();
	event.stopPropagation();
	toggle();
};

export const handlePdfCardActionsBackgroundClick = (
	event: Pick<MouseEvent, "target" | "currentTarget">,
	toggle: () => void,
): void => {
	if (event.target === event.currentTarget) toggle();
};
