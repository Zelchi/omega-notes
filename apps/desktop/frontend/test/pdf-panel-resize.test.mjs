import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfPanelResizeController, createPdfPanelResizeHandlers } from '../src/features/manage-pdfs/model/panel-resize.ts';

test('panel resize starts only for a primary pointer when resizing is enabled', () => {
	const widths = [];
	const resize = createPdfPanelResizeController(width => widths.push(width));
	const start = { enabled: true, button: 0, pointerId: 1, clientX: 400, panelWidth: 500 };

	assert.equal(resize.start({ ...start, button: 2 }), false);
	assert.equal(resize.start({ ...start, enabled: false }), false);
	assert.equal(resize.move({ pointerId: 1, clientX: 350, viewportWidth: 1200 }), false);
	assert.deepEqual(widths, []);

	assert.equal(resize.start(start), true);
	assert.equal(resize.move({ pointerId: 2, clientX: 350, viewportWidth: 1200 }), false);
	assert.deepEqual(widths, []);
});

test('panel resize follows pointer delta, clamps to viewport limits, and applies the final stop position', () => {
	const widths = [];
	const resize = createPdfPanelResizeController(width => widths.push(width));
	assert.equal(resize.start({
		enabled: true,
		button: 0,
		pointerId: 7,
		clientX: 500,
		panelWidth: 600,
	}), true);

	assert.equal(resize.move({ pointerId: 7, clientX: 550, viewportWidth: 1200 }), true);
	assert.equal(widths.at(-1), 550);
	assert.equal(resize.move({ pointerId: 7, clientX: 0, viewportWidth: 1200 }), true);
	assert.equal(widths.at(-1), 762);
	assert.equal(resize.stop({ pointerId: 7, clientX: 700, viewportWidth: 1200 }), true);
	assert.equal(widths.at(-1), 420);
	assert.equal(resize.move({ pointerId: 7, clientX: 600, viewportWidth: 1200 }), false);
});

test('pointer handlers capture accepted starts and only prevent defaults for active gestures', () => {
	const widths = [];
	const controller = createPdfPanelResizeController(width => widths.push(width));
	let enabled = true;
	let viewportWidth = 1200;
	const panel = { getBoundingClientRect: () => ({ width: 600 }) };
	const handlers = createPdfPanelResizeHandlers({
		controller,
		isEnabled: () => enabled,
		getPanelWidth: () => 500,
		getPanelElement: () => panel,
		getViewportWidth: () => viewportWidth,
	});
	const calls = [];
	const event = (overrides = {}) => ({
		button: 0,
		pointerId: 4,
		clientX: 500,
		currentTarget: { setPointerCapture: pointerId => calls.push(['capture', pointerId]) },
		preventDefault: () => calls.push(['prevent']),
		stopPropagation: () => calls.push(['stop-propagation']),
		...overrides,
	});

	enabled = false;
	handlers.start(event());
	assert.deepEqual(calls, []);
	enabled = true;
	handlers.start(event({ button: 2 }));
	assert.deepEqual(calls, []);

	handlers.start(event());
	assert.deepEqual(calls, [['prevent'], ['stop-propagation'], ['capture', 4]]);
	handlers.move({ pointerId: 3, clientX: 450, preventDefault: () => calls.push(['wrong-pointer']) });
	handlers.move({ pointerId: 4, clientX: 550, preventDefault: () => calls.push(['prevent-move']) });
	viewportWidth = 1000;
	handlers.stop({ pointerId: 4, clientX: 650, preventDefault: () => calls.push(['prevent-stop']) });
	assert.deepEqual(calls.slice(3), [['prevent-move'], ['prevent-stop']]);
	assert.deepEqual(widths, [550, 450]);
});
