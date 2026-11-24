export const hasKanbanDragThreshold = (
	startX: number,
	startY: number,
	clientX: number,
	clientY: number,
): boolean => Math.hypot(clientX - startX, clientY - startY) >= 5;

export const getKanbanDropPosition = <T>(
	cards: readonly T[],
	clientY: number,
	getBounds: (card: T) => Pick<DOMRect, "top" | "height">,
): number => {
	let low = 0;
	let high = cards.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const bounds = getBounds(cards[middle]!);
		if (clientY < bounds.top + bounds.height / 2) high = middle;
		else low = middle + 1;
	}
	return low;
};
