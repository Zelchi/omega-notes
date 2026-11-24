import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { getPdfPageRenderConfig } from "./page-preview";
import type { PdfPageNodes } from "./page-elements";

type PdfTextLayerTask = { cancel: () => void; render: () => Promise<void> };
type CachedPdfPreview = { signature: string; bitmap: ImageBitmap; width: number; height: number };
type RenderConfig = ReturnType<typeof getPdfPageRenderConfig>;

type PdfPageRendererEnvironment = {
	getRenderConfig: (
		page: PDFPageProxy,
		width: number,
		height: number,
		scaleFactor: number,
		twoPageLayout: boolean,
	) => RenderConfig;
	createTextLayer: (
		textContent: Awaited<ReturnType<PDFPageProxy["getTextContent"]>>,
		container: HTMLDivElement,
		viewport: ReturnType<PDFPageProxy["getViewport"]>,
	) => PdfTextLayerTask;
};

type RenderPdfPagesOptions = {
	document: PDFDocumentProxy;
	pages: number[];
	pageElements: Map<number, PdfPageNodes>;
	width: number;
	height: number;
	scaleFactor: number;
	expectedSignatures: Map<number, string>;
	previews: Map<number, CachedPdfPreview | undefined>;
	onTextLayerReady: (page: number) => void;
	onTextLayerError: () => void;
};

export const createPdfPageRenderer = (environment: PdfPageRendererEnvironment) => {
	let revision = 0;
	const renderTasks = new Map<number, RenderTask>();
	const textLayerTasks = new Map<number, PdfTextLayerTask>();

	const cancel = () => {
		revision += 1;
		for (const task of renderTasks.values()) task.cancel();
		renderTasks.clear();
		for (const task of textLayerTasks.values()) task.cancel();
		textLayerTasks.clear();
	};

	const render = async (options: RenderPdfPagesOptions): Promise<
		{ status: "rendered" | "cancelled" } | { status: "failed"; error: unknown }
	> => {
		const currentRevision = revision;
		const isCurrent = () => currentRevision === revision;
		const renderPage = async (pageNumber: number): Promise<void> => {
			if (!isCurrent()) return;
			const pageNodes = options.pageElements.get(pageNumber);
			const canvas = pageNodes?.canvas;
			const textLayerContainer = pageNodes?.textLayer;
			if (!canvas || !textLayerContainer) throw Error("PDF_PAGE_ELEMENT_UNAVAILABLE");

			const page = await options.document.getPage(pageNumber);
			if (!isCurrent()) return;
			const twoPageLayout = options.pages.length > 1;
			const { viewport, outputScale } = environment.getRenderConfig(
				page, options.width, options.height, options.scaleFactor, twoPageLayout,
			);
			const cachedPreview = options.previews.get(pageNumber)?.signature === options.expectedSignatures.get(pageNumber)
				? options.previews.get(pageNumber)
				: undefined;
			if (cachedPreview) {
				canvas.width = cachedPreview.bitmap.width;
				canvas.height = cachedPreview.bitmap.height;
				canvas.style.width = `${cachedPreview.width}px`;
				canvas.style.height = `${cachedPreview.height}px`;
			} else {
				canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
				canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
				canvas.style.width = `${Math.floor(viewport.width)}px`;
				canvas.style.height = `${Math.floor(viewport.height)}px`;
			}
			const context = canvas.getContext("2d");
			if (!context) throw Error("PDF_CANVAS_UNAVAILABLE");
			if (cachedPreview) context.drawImage(cachedPreview.bitmap, 0, 0);

			const renderPromise = cachedPreview ? Promise.resolve() : (async () => {
				const task = page.render({
					canvas,
					canvasContext: context,
					viewport,
					transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
					background: "#fff",
				});
				renderTasks.set(pageNumber, task);
				try {
					await task.promise;
				} finally {
					if (renderTasks.get(pageNumber) === task) renderTasks.delete(pageNumber);
				}
			})();

			let currentTextLayerTask: PdfTextLayerTask | undefined;
			const textLayerPromise = (async () => {
				try {
					const textContent = await page.getTextContent();
					if (!isCurrent()) return;
					textLayerContainer.style.setProperty("--scale-factor", String(viewport.scale));
					textLayerContainer.style.setProperty("--user-unit", String(viewport.userUnit));
					currentTextLayerTask = environment.createTextLayer(textContent, textLayerContainer, viewport);
					textLayerTasks.set(pageNumber, currentTextLayerTask);
					await currentTextLayerTask.render();
					if (isCurrent()) options.onTextLayerReady(pageNumber);
				} catch {
					if (isCurrent()) options.onTextLayerError();
				} finally {
					if (textLayerTasks.get(pageNumber) === currentTextLayerTask) textLayerTasks.delete(pageNumber);
				}
			})();
			await Promise.all([renderPromise, textLayerPromise]);
		};

		const results = await Promise.allSettled(options.pages.map(renderPage));
		if (!isCurrent()) return { status: "cancelled" };
		const failed = results.find(result => result.status === "rejected");
		return failed?.status === "rejected"
			? { status: "failed", error: failed.reason }
			: { status: "rendered" };
	};

	return { cancel, render };
};
