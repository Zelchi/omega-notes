import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { getPdfAdjacentPreviewPages, getPdfPageSpreadPages, pdfPageSpreadGap } from "./page-spread";

type PdfPageRenderConfig = { viewport: ReturnType<PDFPageProxy["getViewport"]>; outputScale: number };
type CachedPdfPagePreview = { signature: string; bitmap: ImageBitmap; width: number; height: number };
type PreviewEnvironment = {
	devicePixelRatio: () => number;
	createCanvas: () => HTMLCanvasElement;
	createBitmap: (canvas: HTMLCanvasElement) => Promise<ImageBitmap>;
};

const browserEnvironment: PreviewEnvironment = {
	devicePixelRatio: () => window.devicePixelRatio || 1,
	createCanvas: () => window.document.createElement("canvas"),
	createBitmap: canvas => createImageBitmap(canvas),
};

export const getPdfPageRenderConfig = (
	page: PDFPageProxy, width: number, height: number, scaleFactor: number, spreadEnabled: boolean,
	devicePixelRatio = window.devicePixelRatio || 1,
): PdfPageRenderConfig => {
	const baseViewport = page.getViewport({ scale: 1 });
	const horizontalFrameSpace = 28 + (spreadEnabled ? pdfPageSpreadGap + 4 : 2);
	const availableWidth = Math.max(1, width - horizontalFrameSpace);
	const pageWidth = spreadEnabled ? availableWidth / 2 : availableWidth;
	const fitScale = Math.min(pageWidth / baseViewport.width, Math.max(1, height - 30) / baseViewport.height);
	const displayScale = Math.max(0.1, fitScale * scaleFactor);
	return {
		viewport: page.getViewport({ scale: displayScale }),
		outputScale: Math.min(devicePixelRatio, 2),
	};
};

const getPdfPagePreviewBaseSignature = (width: number, height: number, scaleFactor: number, devicePixelRatio = window.devicePixelRatio || 1): string =>
	`${width}:${height}:${scaleFactor}:${Math.min(devicePixelRatio, 2)}`;

export const getPdfPagePreviewSignature = (width: number, height: number, scaleFactor: number, twoPageLayout: boolean, devicePixelRatio = window.devicePixelRatio || 1): string =>
	`${getPdfPagePreviewBaseSignature(width, height, scaleFactor, devicePixelRatio)}:${twoPageLayout}`;

export const createPdfPagePreviews = (environment: PreviewEnvironment = browserEnvironment) => {
	let revision = 0;
	const cache = new Map<number, CachedPdfPagePreview>();
	const tasks = new Map<number, RenderTask>();

	const cancelPagePreviewTasks = () => {
		revision += 1;
		for (const task of tasks.values()) task.cancel();
		tasks.clear();
	};
	const clearPagePreviewCache = () => {
		for (const preview of cache.values()) preview.bitmap.close();
		cache.clear();
	};
	const prune = (expectedSignatures: Map<number, string>) => {
		for (const [page, preview] of cache) {
			if (expectedSignatures.get(page) === preview.signature) continue;
			preview.bitmap.close();
			cache.delete(page);
		}
	};
	const visiblePreviews = (pages: number[], width: number, height: number, scaleFactor: number) => {
		const baseSignature = getPdfPagePreviewBaseSignature(width, height, scaleFactor, environment.devicePixelRatio());
		const visible = new Map(pages.map(page => [page, cache.get(page)]));
		for (const [page, preview] of cache) {
			if (preview.signature.startsWith(`${baseSignature}:`)) continue;
			preview.bitmap.close();
			cache.delete(page);
			visible.delete(page);
		}
		return visible;
	};
	const preloadAdjacentPages = async (
		document: PDFDocumentProxy, pages: number[], pageCount: number, width: number, height: number,
		scaleFactor: number, spread: boolean,
	) => {
		const currentRevision = revision;
		const candidates = getPdfAdjacentPreviewPages(pages[0] ?? 1, pages, Math.min(pageCount, document.numPages), spread);
		const expectedSignatures = new Map(candidates.map(candidate => {
			const twoPageLayout = getPdfPageSpreadPages(candidate, pageCount, spread).length > 1;
			return [candidate, getPdfPagePreviewSignature(width, height, scaleFactor, twoPageLayout, environment.devicePixelRatio())];
		}));
		prune(expectedSignatures);
		for (const candidate of candidates) {
			if (currentRevision !== revision) return;
			const signature = expectedSignatures.get(candidate)!;
			if (cache.get(candidate)?.signature === signature) continue;
			const canvas = environment.createCanvas();
			let task: RenderTask | undefined;
			try {
				const page = await document.getPage(candidate);
				if (currentRevision !== revision) return;
				const twoPageLayout = getPdfPageSpreadPages(candidate, pageCount, spread).length > 1;
				const { viewport, outputScale } = getPdfPageRenderConfig(page, width, height, scaleFactor, twoPageLayout, environment.devicePixelRatio());
				canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
				canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
				const context = canvas.getContext("2d", { alpha: false });
				if (!context) continue;
				task = page.render({
					canvas, canvasContext: context, viewport,
					transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
					background: "#fff",
				});
				tasks.set(candidate, task);
				await task.promise;
				if (currentRevision !== revision) return;
				const bitmap = await environment.createBitmap(canvas);
				if (currentRevision !== revision) {
					bitmap.close();
					return;
				}
				cache.set(candidate, { signature, bitmap, width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
			} catch {
				// A failed background preview should not interrupt normal page rendering.
			} finally {
				if (task && tasks.get(candidate) === task) tasks.delete(candidate);
				canvas.width = 0;
				canvas.height = 0;
			}
		}
	};
	return { cancelPagePreviewTasks, clearPagePreviewCache, visiblePreviews, preloadAdjacentPages };
};
