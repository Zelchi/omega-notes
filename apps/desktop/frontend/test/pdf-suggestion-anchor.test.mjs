import assert from 'node:assert/strict';
import test from 'node:test';
import { getPdfSuggestionAnchor, observePdfSuggestionAnchor } from '../src/features/manage-pdfs/model/pdf-suggestion-anchor.ts';

const createEventTarget = () => {
	const listeners = new Map();
	return {
		addEventListener: (type, listener) => listeners.set(type, listener),
		removeEventListener: (type, listener) => {
			if (listeners.get(type) === listener) listeners.delete(type);
		},
		emit: type => listeners.get(type)?.(),
		has: type => listeners.has(type),
	};
};

const createFrameScheduler = () => {
	let nextFrame = 1;
	const frames = new Map();
	const cancelled = [];
	return {
		cancelled,
		request: callback => {
			const frame = nextFrame++;
			frames.set(frame, callback);
			return frame;
		},
		cancel: frame => {
			cancelled.push(frame);
			frames.delete(frame);
		},
		run: frame => {
			const callback = frames.get(frame);
			frames.delete(frame);
			callback?.();
		},
		pending: () => [...frames.keys()],
	};
};

test('suggestion anchor ignores disconnected inputs and measures the connected input center', () => {
	const bounds = { left: 24, top: 60, width: 96, height: 32 };
	assert.equal(getPdfSuggestionAnchor(undefined), undefined);
	assert.equal(getPdfSuggestionAnchor({ isConnected: false, getBoundingClientRect: () => bounds }), undefined);
	assert.deepEqual(getPdfSuggestionAnchor({ isConnected: true, getBoundingClientRect: () => bounds }), {
		left: 72,
		top: 60,
		height: 32,
	});
});

test('initial and scheduled updates position the suggestion anchor at the input center', () => {
	const bounds = { left: 100, top: 40, width: 80, height: 30 };
	const input = { isConnected: true, getBoundingClientRect: () => bounds };
	const windowTarget = createEventTarget();
	const scrollTarget = createEventTarget();
	const frames = createFrameScheduler();
	const anchors = [];
	observePdfSuggestionAnchor({
		getInput: () => input,
		windowTarget,
		scrollTarget,
		setAnchor: anchor => anchors.push(anchor),
		requestFrame: frames.request,
		cancelFrame: frames.cancel,
	});

	assert.deepEqual(anchors, [{ left: 140, top: 40, height: 30 }]);
	bounds.left = 160;
	windowTarget.emit('resize');
	const [frame] = frames.pending();
	frames.run(frame);
	assert.deepEqual(anchors, [
		{ left: 140, top: 40, height: 30 },
		{ left: 200, top: 40, height: 30 },
	]);
});

test('resize and scroll events coalesce to the latest input bounds', () => {
	const bounds = { left: 10, top: 20, width: 60, height: 28 };
	const input = { isConnected: true, getBoundingClientRect: () => bounds };
	const windowTarget = createEventTarget();
	const scrollTarget = createEventTarget();
	const frames = createFrameScheduler();
	const anchors = [];
	observePdfSuggestionAnchor({
		getInput: () => input,
		windowTarget,
		scrollTarget,
		setAnchor: anchor => anchors.push(anchor),
		requestFrame: frames.request,
		cancelFrame: frames.cancel,
	});
	windowTarget.emit('resize');
	const replacedFrame = frames.pending()[0];
	bounds.top = 80;
	scrollTarget.emit('scroll');
	const currentFrame = frames.pending()[0];

	assert.deepEqual(frames.cancelled, [replacedFrame]);
	assert.notEqual(currentFrame, replacedFrame);
	frames.run(currentFrame);
	assert.deepEqual(anchors.at(-1), { left: 40, top: 80, height: 28 });
});

test('disconnected input is ignored and stopping removes listeners and cancels pending work', () => {
	const input = {
		isConnected: false,
		getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 10 }),
	};
	const windowTarget = createEventTarget();
	const scrollTarget = createEventTarget();
	const frames = createFrameScheduler();
	const anchors = [];
	const stop = observePdfSuggestionAnchor({
		getInput: () => input,
		windowTarget,
		scrollTarget,
		setAnchor: anchor => anchors.push(anchor),
		requestFrame: frames.request,
		cancelFrame: frames.cancel,
	});

	assert.deepEqual(anchors, []);
	input.isConnected = true;
	windowTarget.emit('resize');
	const pending = frames.pending()[0];
	stop();
	frames.run(pending);

	assert.deepEqual(anchors, []);
	assert.deepEqual(frames.cancelled, [pending]);
	assert.equal(windowTarget.has('resize'), false);
	assert.equal(scrollTarget.has('scroll'), false);
});
