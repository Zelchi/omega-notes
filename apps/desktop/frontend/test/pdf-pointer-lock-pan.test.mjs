import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfReaderPointerLockPan, installPdfReaderPointerLockPan } from '../src/features/manage-pdfs/model/pointer-lock-pan.ts';

const setup = (overrides = {}) => {
	const calls = [];
	const state = { hovered: true, locked: false, viewportLocked: false };
	const environment = {
		isHovered: () => state.hovered,
		hasPointerLock: () => state.locked,
		isViewportLocked: () => state.viewportLocked,
		requestLock: () => { calls.push('request'); },
		exitLock: () => { calls.push('exit'); state.viewportLocked = false; },
		activatePan: () => calls.push('activate'),
		resetPanPointer: () => calls.push('reset'),
		finishPan: () => calls.push('finish'),
		...overrides,
	};
	return { pan: createPdfReaderPointerLockPan(environment), calls, state };
};

const createEventTarget = () => {
	const listeners = new Map();
	return {
		addEventListener: (type, listener, options) => listeners.set(type, { listener, capture: options === true }),
		removeEventListener: (type, listener, options) => {
			const current = listeners.get(type);
			if (current?.listener === listener && current.capture === (options === true)) listeners.delete(type);
		},
		emit: (type, event = {}) => listeners.get(type)?.listener(event),
		has: (type, capture = false) => listeners.get(type)?.capture === capture,
	};
};

test('installed pointer-lock listeners drive Alt, blur and lock-change behavior and are removed on cleanup', () => {
	const calls = [];
	const state = { hovered: true, locked: false, viewportLocked: false };
	const environment = {
		isHovered: () => state.hovered,
		hasPointerLock: () => state.locked,
		isViewportLocked: () => state.viewportLocked,
		requestLock: () => calls.push('request'),
		exitLock: () => { calls.push('exit'); state.viewportLocked = false; },
		activatePan: () => calls.push('activate'),
		resetPanPointer: () => calls.push('reset'),
		finishPan: () => calls.push('finish'),
	};
	const windowTarget = createEventTarget();
	const documentTarget = createEventTarget();
	const stop = installPdfReaderPointerLockPan(environment, { windowTarget, documentTarget });

	assert.equal(windowTarget.has('keydown', true), true);
	assert.equal(windowTarget.has('keyup', true), true);
	assert.equal(windowTarget.has('blur'), true);
	assert.equal(documentTarget.has('pointerlockchange'), true);
	windowTarget.emit('keydown', { key: 'Alt', repeat: false });
	documentTarget.emit('pointerlockchange');
	state.viewportLocked = true;
	windowTarget.emit('keyup', { altKey: false });
	assert.deepEqual(calls, ['activate', 'request', 'reset', 'exit', 'finish']);

	stop();
	stop();
	assert.deepEqual(calls, ['activate', 'request', 'reset', 'exit', 'finish', 'finish']);
	assert.equal(windowTarget.has('keydown', true), false);
	assert.equal(windowTarget.has('keyup', true), false);
	assert.equal(windowTarget.has('blur'), false);
	assert.equal(documentTarget.has('pointerlockchange'), false);
	windowTarget.emit('keydown', { key: 'Alt', repeat: false });
	windowTarget.emit('blur');
	documentTarget.emit('pointerlockchange');
	assert.deepEqual(calls, ['activate', 'request', 'reset', 'exit', 'finish', 'finish']);
});

test('Alt press ignores repeats, other keys, and a pointer outside the reader', () => {
	const { pan, calls, state } = setup();

	pan.pressAlt({ key: 'Shift', repeat: false });
	pan.pressAlt({ key: 'Alt', repeat: true });
	state.hovered = false;
	pan.pressAlt({ key: 'Alt', repeat: false });

	assert.deepEqual(calls, []);
});

test('Alt activates panning and requests pointer lock only when no element already owns it', () => {
	const { pan, calls, state } = setup();
	state.locked = true;

	pan.pressAlt({ key: 'Alt', repeat: false });
	assert.deepEqual(calls, ['activate']);

	state.locked = false;
	pan.pressAlt({ key: 'Alt', repeat: false });
	assert.deepEqual(calls, ['activate', 'activate', 'request']);
});

test('releasing Alt finishes panning and unlocks only this reader viewport', () => {
	const { pan, calls, state } = setup();
	pan.pressAlt({ key: 'Alt', repeat: false });
	state.viewportLocked = true;

	pan.releaseAlt({ altKey: true });
	assert.deepEqual(calls, ['activate', 'request']);

	pan.releaseAlt({ altKey: false });
	assert.deepEqual(calls, ['activate', 'request', 'exit', 'finish']);
});

test('pointer-lock changes reset the free-pan anchor and unlock when Alt is no longer held', () => {
	const { pan, calls, state } = setup();
	pan.pressAlt({ key: 'Alt', repeat: false });
	state.viewportLocked = true;

	pan.pointerLockChanged();
	assert.deepEqual(calls, ['activate', 'request', 'reset']);

	pan.stop();
	pan.pointerLockChanged();
	assert.deepEqual(calls, ['activate', 'request', 'reset', 'exit', 'finish', 'reset']);
});

test('a late successful lock request is released if Alt was already released', async () => {
	let resolveRequest;
	const pending = new Promise(resolve => { resolveRequest = resolve; });
	const { pan, calls, state } = setup({ requestLock: () => { calls.push('request'); return pending; } });

	pan.pressAlt({ key: 'Alt', repeat: false });
	pan.stop();
	state.viewportLocked = true;
	resolveRequest();
	await pending;
	await Promise.resolve();

	assert.deepEqual(calls, ['activate', 'request', 'finish', 'exit']);
});

test('synchronous and asynchronous pointer-lock failures preserve hover panning', async () => {
	const sync = setup({ requestLock: () => { throw new Error('unsupported'); } });
	assert.doesNotThrow(() => sync.pan.pressAlt({ key: 'Alt', repeat: false }));
	assert.deepEqual(sync.calls, ['activate']);

	const asyncFailure = setup({ requestLock: () => Promise.reject(new Error('denied')) });
	asyncFailure.pan.pressAlt({ key: 'Alt', repeat: false });
	await Promise.resolve();
	assert.deepEqual(asyncFailure.calls, ['activate']);
});
