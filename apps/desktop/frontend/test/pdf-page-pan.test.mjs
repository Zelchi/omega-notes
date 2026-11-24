import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfReaderPanController, createPdfReaderPanHandlers } from '../src/features/manage-pdfs/model/page-pan.ts';

const viewport = () => ({ scrollLeft: 100, scrollTop: 200 });

test('free panning applies pointer deltas only while Alt is held with no mouse button', () => {
	const states = [];
	const target = viewport();
	const pan = createPdfReaderPanController(active => states.push(active));
	const move = (overrides = {}) => pan.move({
		viewport: target,
		pointerType: 'mouse',
		pointerLocked: false,
		clientX: 10,
		clientY: 20,
		altKey: true,
		buttons: 0,
		overContextMenu: false,
		...overrides,
	});

	move();
	assert.deepEqual([target.scrollLeft, target.scrollTop], [100, 200]);
	move({ clientX: 18, clientY: 14 });
	assert.deepEqual([target.scrollLeft, target.scrollTop], [108, 194]);
	assert.deepEqual(states, [true, true]);

	move({ clientX: 30, clientY: 40, buttons: 1 });
	assert.deepEqual([target.scrollLeft, target.scrollTop], [108, 194]);
	assert.equal(states.at(-1), false);
});

test('free panning ignores non-mouse, pointer-locked, and context-menu movement', () => {
	const states = [];
	const target = viewport();
	const pan = createPdfReaderPanController(active => states.push(active));
	const sample = {
		viewport: target,
		pointerType: 'mouse',
		pointerLocked: false,
		clientX: 10,
		clientY: 20,
		altKey: true,
		buttons: 0,
		overContextMenu: false,
	};

	pan.move({ ...sample, pointerType: 'touch' });
	pan.move({ ...sample, pointerLocked: true });
	pan.move({ ...sample, overContextMenu: true });
	assert.deepEqual([target.scrollLeft, target.scrollTop], [100, 200]);
	assert.deepEqual(states, [false]);
});

test('pointer-lock movement uses relative deltas and requires Alt plus the locked viewport', () => {
	const target = viewport();
	const pan = createPdfReaderPanController(() => undefined);

	pan.moveLocked({
		viewport: target, pointerLocked: true, altKey: true, movementX: 7, movementY: -3,
	});
	assert.deepEqual([target.scrollLeft, target.scrollTop], [107, 197]);

	pan.moveLocked({
		viewport: target, pointerLocked: false, altKey: true, movementX: 10, movementY: 10,
	});
	pan.moveLocked({
		viewport: target, pointerLocked: true, altKey: false, movementX: 10, movementY: 10,
	});
	assert.deepEqual([target.scrollLeft, target.scrollTop], [107, 197]);
});

test('finishing or resetting the pointer clears the next free-pan anchor', () => {
	const states = [];
	const target = viewport();
	const pan = createPdfReaderPanController(active => states.push(active));
	const sample = {
		viewport: target,
		pointerType: 'mouse',
		pointerLocked: false,
		altKey: true,
		buttons: 0,
		overContextMenu: false,
	};

	pan.move({ ...sample, clientX: 0, clientY: 0 });
	pan.resetPointer();
	pan.move({ ...sample, clientX: 10, clientY: 10 });
	pan.finish();
	pan.move({ ...sample, clientX: 20, clientY: 20 });

	assert.deepEqual([target.scrollLeft, target.scrollTop], [100, 200]);
	assert.deepEqual(states, [true, true, false, true]);
});

test('DOM pan handlers adapt pointer and locked-mouse events for the controller', () => {
	const calls = [];
	const viewportElement = viewport();
	const menu = {};
	const handlers = createPdfReaderPanHandlers({
		move: sample => calls.push(['move', sample]),
		moveLocked: sample => calls.push(['locked', sample]),
	}, {
		isPointerLocked: target => target === viewportElement,
		isOverContextMenu: target => target === menu,
	});

	handlers.move({
		currentTarget: viewportElement,
		pointerType: 'mouse',
		clientX: 12,
		clientY: 24,
		altKey: true,
		buttons: 0,
		target: menu,
	});
	handlers.moveLocked({
		currentTarget: viewportElement,
		altKey: true,
		movementX: 5,
		movementY: -2,
	});

	assert.deepEqual(calls, [
		['move', {
			viewport: viewportElement,
			pointerType: 'mouse',
			pointerLocked: true,
			clientX: 12,
			clientY: 24,
			altKey: true,
			buttons: 0,
			overContextMenu: true,
		}],
		['locked', {
			viewport: viewportElement,
			pointerLocked: true,
			altKey: true,
			movementX: 5,
			movementY: -2,
		}],
	]);
});
