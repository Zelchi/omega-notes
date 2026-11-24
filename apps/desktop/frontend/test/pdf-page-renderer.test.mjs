import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfPageRenderer } from '../src/features/manage-pdfs/model/page-renderer.ts';
import { deferred } from './helpers.mjs';

const fixture = ({ renderGate, textLayerGate, failTextLayer = false, canvasContext = {} } = {}) => {
	const renderCalls = [], drawCalls = [], readyPages = [], errors = [], cancelledRenders = [], cancelledTextLayers = [];
	const canvases = new Map(), textLayers = new Map();
	const page = number => ({
		getViewport: ({ scale }) => ({ width: 200 * scale, height: 400 * scale, scale, userUnit: 1 }),
		render(options) {
			renderCalls.push({ number, options });
			return { promise: renderGate?.promise ?? Promise.resolve(), cancel: () => cancelledRenders.push(number) };
		},
		async getTextContent() { return { page: number }; },
	});
	const environment = {
		getRenderConfig: (pdfPage, width, height, scaleFactor, twoPageLayout) => {
			const viewport = pdfPage.getViewport({ scale: scaleFactor * (twoPageLayout ? 0.5 : 1) });
			return { viewport, outputScale: 2 };
		},
		createTextLayer: (content, container, viewport) => {
			const task = {
				async render() {
					if (textLayerGate) await textLayerGate.promise;
					if (failTextLayer) throw Error('text layer failed');
				},
				cancel() { cancelledTextLayers.push(content.page); },
			};
			textLayers.set(content.page, { task, container, viewport });
			return task;
		},
	};
	const renderer = createPdfPageRenderer(environment);
	const document = { async getPage(number) { return page(number); } };
	const pageElements = new Map();
	for (const number of [1, 2]) {
		const canvas = {
			width: 0,
			height: 0,
			style: {},
			getContext: () => canvasContext && ({
				drawImage: (...args) => drawCalls.push({ page: number, args }),
			}),
		};
		const textLayer = { style: { setProperty: () => undefined } };
		canvases.set(number, canvas);
		pageElements.set(number, { canvas, textLayer });
	}
	const render = (pages, { expectedSignatures = new Map(), previews = new Map() } = {}) => renderer.render({
		document,
		pages,
		pageElements,
		width: 500,
		height: 600,
		scaleFactor: 1,
		expectedSignatures,
		previews,
		onTextLayerReady: pageNumber => readyPages.push(pageNumber),
		onTextLayerError: () => errors.push('text-layer'),
	});
	return {
		renderer, render, canvases, textLayers, renderCalls, drawCalls, readyPages, errors,
		cancelledRenders, cancelledTextLayers,
	};
};

test('visible PDF pages render canvases and text layers with the shared viewport config', async () => {
	const f = fixture();
	assert.deepEqual(await f.render([1, 2]), { status: 'rendered' });
	assert.deepEqual(f.renderCalls.map(call => call.number), [1, 2]);
	assert.deepEqual(f.renderCalls[0].options.transform, [2, 0, 0, 2, 0, 0]);
	assert.deepEqual(f.readyPages, [1, 2]);
	assert.deepEqual(f.errors, []);
	assert.equal(f.canvases.get(1).width, 200);
	assert.equal(f.canvases.get(1).height, 400);
	assert.equal(f.canvases.get(1).style.width, '100px');
	assert.equal(f.textLayers.get(1).viewport.scale, 0.5);
});

test('matching page previews draw directly and skip a second canvas render', async () => {
	const f = fixture();
	const bitmap = { width: 320, height: 640 };
	const signature = 'matching-layout';
	assert.deepEqual(await f.render([1], {
		expectedSignatures: new Map([[1, signature]]),
		previews: new Map([[1, { signature, bitmap, width: 160, height: 320 }]]),
	}), { status: 'rendered' });
	assert.deepEqual(f.renderCalls, []);
	assert.equal(f.drawCalls[0].args[0], bitmap);
	assert.equal(f.canvases.get(1).width, 320);
	assert.equal(f.canvases.get(1).style.height, '320px');
	assert.deepEqual(f.readyPages, [1]);
});

test('an unavailable canvas fails visible rendering while text-layer errors remain isolated', async () => {
	const noCanvas = fixture({ canvasContext: null });
	const failure = await noCanvas.render([1]);
	assert.equal(failure.status, 'failed');
	assert.match(failure.error.message, /PDF_CANVAS_UNAVAILABLE/);

	const textLayerFailure = fixture({ failTextLayer: true });
	assert.deepEqual(await textLayerFailure.render([1]), { status: 'rendered' });
	assert.deepEqual(textLayerFailure.errors, ['text-layer']);
	assert.deepEqual(textLayerFailure.readyPages, []);
});

test('cancelling visible rendering cancels both task types and ignores late completion', async () => {
	const renderGate = deferred(), textLayerGate = deferred();
	const f = fixture({ renderGate, textLayerGate });
	const pending = f.render([1]);
	await new Promise(resolve => setImmediate(resolve));
	f.renderer.cancel();
	assert.deepEqual(f.cancelledRenders, [1]);
	assert.deepEqual(f.cancelledTextLayers, [1]);
	renderGate.resolve();
	textLayerGate.resolve();
	assert.deepEqual(await pending, { status: 'cancelled' });
	assert.deepEqual(f.readyPages, []);
});
