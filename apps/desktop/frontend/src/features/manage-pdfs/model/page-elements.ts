export type PdfPageNodes = {
	canvas?: HTMLCanvasElement;
	textLayer?: HTMLDivElement;
};

export const arePdfPageElementsReady = (
	pages: readonly number[],
	elements: ReadonlyMap<number, PdfPageNodes>,
) => pages.every(page => {
	const nodes = elements.get(page);
	return nodes?.canvas && nodes.textLayer;
});
