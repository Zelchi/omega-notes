import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfPagePreviews, getPdfPageRenderConfig } from '../src/features/manage-pdfs/model/page-preview.ts';
import { deferred } from './helpers.mjs';

const fixture = ({ renderGate, bitmapGate, failPage } = {}) => {
	const canvases = [], bitmaps = [], renders = [], cancelled = [];
	const environment = {
		devicePixelRatio: () => 3,
		createCanvas: () => {
			const canvas = { width: 0, height: 0, getContext: () => ({}) };
			canvases.push(canvas);
			return canvas;
		},
		createBitmap: async () => {
			if (bitmapGate) await bitmapGate.promise;
			const bitmap = { closed: false, close() { this.closed = true; } };
			bitmaps.push(bitmap);
			return bitmap;
		},
	};
	const document = {
		numPages: 3,
		async getPage(number) {
			if (number === failPage) throw Error('invalid page');
			return {
				getViewport: ({ scale }) => ({ width: 200 * scale, height: 400 * scale, scale }),
				render(options) {
					renders.push({ number, options });
					return { promise: renderGate?.promise ?? Promise.resolve(), cancel: () => cancelled.push(number) };
				},
			};
		},
	};
	return { ...createPdfPagePreviews(environment), document, canvases, bitmaps, renders, cancelled };
};

test('previews render adjacent pages, reuse cached bitmaps and release them when size changes', async () => {
	const f = fixture();
	await f.preloadAdjacentPages(f.document, [2], 3, 500, 500, 1, false);
	assert.deepEqual(f.renders.map(render => render.number), [3, 1]);
	assert.equal(f.renders[0].options.transform[0], 2);
	assert.ok(f.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
	assert.ok(f.visiblePreviews([1, 3], 500, 500, 1).get(1));
	await f.preloadAdjacentPages(f.document, [2], 3, 500, 500, 1, false);
	assert.equal(f.renders.length, 2);
	assert.equal(f.visiblePreviews([1], 501, 500, 1).get(1), undefined);
	assert.ok(f.bitmaps.every(bitmap => bitmap.closed));
	await f.preloadAdjacentPages(f.document, [2], 3, 501, 500, 1, false);
	f.clearPagePreviewCache();
	assert.ok(f.bitmaps.every(bitmap => bitmap.closed));
});

test('cancel invalidates an in-flight render and prevents its preview from being cached', async () => {
	const renderGate = deferred();
	const f = fixture({ renderGate });
	const loading = f.preloadAdjacentPages(f.document, [1], 3, 500, 500, 1, false);
	await new Promise(resolve => setImmediate(resolve));
	f.cancelPagePreviewTasks();
	assert.deepEqual(f.cancelled, [2]);
	renderGate.resolve();
	await loading;
	assert.equal(f.bitmaps.length, 0);
	assert.equal(f.visiblePreviews([2], 500, 500, 1).get(2), undefined);
	assert.equal(f.canvases[0].width, 0);
	assert.equal(f.canvases[0].height, 0);
});

test('a bitmap produced after cancellation is closed immediately', async () => {
	const bitmapGate = deferred();
	const f = fixture({ bitmapGate });
	const loading = f.preloadAdjacentPages(f.document, [1], 3, 500, 500, 1, false);
	await new Promise(resolve => setImmediate(resolve));
	f.cancelPagePreviewTasks();
	bitmapGate.resolve();
	await loading;
	assert.equal(f.bitmaps.length, 1);
	assert.equal(f.bitmaps[0].closed, true);
	assert.equal(f.visiblePreviews([2], 500, 500, 1).get(2), undefined);
});

test('a failed preview does not prevent rendering the other adjacent page', async () => {
	const f = fixture({ failPage: 3 });
	await f.preloadAdjacentPages(f.document, [2], 3, 500, 500, 1, false);
	assert.deepEqual(f.renders.map(render => render.number), [1]);
	assert.ok(f.visiblePreviews([1], 500, 500, 1).get(1));
	assert.ok(f.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
	f.clearPagePreviewCache();
});

test('page layout fits the viewport and caps output pixel ratio', () => {
	const page = { getViewport: ({ scale }) => ({ width: 200 * scale, height: 400 * scale, scale }) };
	assert.deepEqual(getPdfPageRenderConfig(page, 500, 500, 1, false, 3), {
		viewport: { width: 235, height: 470, scale: 1.175 }, outputScale: 2,
	});
	assert.ok(Math.abs(getPdfPageRenderConfig(page, 500, 500, 1, true, 1).viewport.width - 226) < 1e-9);
});
