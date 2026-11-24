import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfPageJumpInputHandlers } from '../src/features/manage-pdfs/model/page-jump-input.ts';
import {
	getPdfZoomScrollAdjustment, getPdfZoomTarget, handlePdfReaderWheelPageNavigation, handlePdfReaderWheelZoom,
	maxPdfZoom, minPdfZoom, parsePdfPageJump, pdfZoomStep,
} from '../src/features/manage-pdfs/model/reader-controls.ts';

test('PDF zoom steps round to tenths and stay within the supported range', () => {
	assert.equal(getPdfZoomTarget(1, pdfZoomStep), 1.1);
	assert.equal(getPdfZoomTarget(2.04, pdfZoomStep), 2.1);
	assert.equal(getPdfZoomTarget(maxPdfZoom, pdfZoomStep), maxPdfZoom);
	assert.equal(getPdfZoomTarget(minPdfZoom, -pdfZoomStep), minPdfZoom);
	assert.equal(getPdfZoomTarget(1.2, 0), 1.2);
});

test('pointer zoom adjusts scroll by the anchored page point after rerender', () => {
	assert.deepEqual(
		getPdfZoomScrollAdjustment(
			{ left: 80, top: 40, width: 600, height: 800 },
			{ x: 0.25, y: 0.5, clientX: 200, clientY: 300 },
		),
		{ left: 30, top: 140 },
	);
});

test('wheel zoom only handles Ctrl gestures, prevents their default, and passes direction and page anchor', () => {
	const calls = [];
	const anchor = { page: 3, x: 0.25, y: 0.75 };
	const event = { ctrlKey: false, deltaY: -20, prevented: 0, preventDefault() { this.prevented += 1; } };
	const getAnchor = () => anchor;
	const changeZoom = (...args) => calls.push(args);

	handlePdfReaderWheelZoom(event, 8, getAnchor, changeZoom);
	assert.equal(event.prevented, 0);
	assert.deepEqual(calls, []);

	event.ctrlKey = true;
	handlePdfReaderWheelZoom(event, 0, getAnchor, changeZoom);
	assert.equal(event.prevented, 1);
	assert.deepEqual(calls, []);

	handlePdfReaderWheelZoom({ ...event, deltaY: 0 }, 8, getAnchor, changeZoom);
	assert.equal(event.prevented, 1);
	assert.deepEqual(calls, []);

	handlePdfReaderWheelZoom(event, 8, getAnchor, changeZoom);
	handlePdfReaderWheelZoom({ ...event, deltaY: 20 }, 8, getAnchor, changeZoom);
	assert.deepEqual(calls, [[pdfZoomStep, anchor], [-pdfZoomStep, anchor]]);
});

test('Shift+wheel navigates pages in both directions and accepts remapped horizontal deltas', () => {
	const calls = [];
	const event = { shiftKey: false, deltaX: 0, deltaY: 50, prevented: 0, preventDefault() { this.prevented += 1; } };
	const movePage = direction => calls.push(direction);

	handlePdfReaderWheelPageNavigation(event, 8, false, movePage);
	assert.equal(event.prevented, 0);
	assert.deepEqual(calls, []);

	event.shiftKey = true;
	handlePdfReaderWheelPageNavigation(event, 8, false, movePage);
	event.deltaY = -50;
	handlePdfReaderWheelPageNavigation(event, 8, false, movePage);
	event.deltaY = 0;
	event.deltaX = 50;
	handlePdfReaderWheelPageNavigation(event, 8, false, movePage);

	assert.equal(event.prevented, 3);
	assert.deepEqual(calls, [1, -1, 1]);
});

test('Shift+wheel prevents viewport scrolling while the reader is busy or has no pages', () => {
	const calls = [];
	const event = { shiftKey: true, deltaX: 0, deltaY: 50, prevented: 0, preventDefault() { this.prevented += 1; } };
	const movePage = direction => calls.push(direction);

	handlePdfReaderWheelPageNavigation(event, 8, true, movePage);
	handlePdfReaderWheelPageNavigation(event, 0, false, movePage);

	assert.equal(event.prevented, 2);
	assert.deepEqual(calls, []);
});

test('page jump accepts only an integer within the loaded document', () => {
	assert.equal(parsePdfPageJump('4', 8), 4);
	for (const value of ['', '0', '9', '2.5', '-1', 'NaN']) {
		assert.equal(parsePdfPageJump(value, 8), undefined);
	}
	assert.equal(parsePdfPageJump('1', 0), undefined);
});

test('page jump input updates its value and commits on blur or Enter', () => {
	const calls = [];
	const input = createPdfPageJumpInputHandlers({
		setValue: value => calls.push(['value', value]),
		goToPage: () => calls.push(['go']),
		close: () => calls.push(['close']),
	});
	input.input({ currentTarget: { value: '7' } });
	input.blur();
	let prevented = 0;
	input.keyDown({ key: 'Enter', preventDefault: () => { prevented += 1; } });

	assert.deepEqual(calls, [['value', '7'], ['go'], ['go']]);
	assert.equal(prevented, 1);
});

test('page jump Escape closes the field without committing and other keys are ignored', () => {
	const calls = [];
	const input = createPdfPageJumpInputHandlers({
		setValue: value => calls.push(['value', value]),
		goToPage: () => calls.push(['go']),
		close: () => calls.push(['close']),
	});
	let prevented = 0;
	input.keyDown({ key: 'ArrowUp', preventDefault: () => { prevented += 1; } });
	input.keyDown({ key: 'Escape', preventDefault: () => { prevented += 1; } });

	assert.deepEqual(calls, [['close']]);
	assert.equal(prevented, 1);
});
