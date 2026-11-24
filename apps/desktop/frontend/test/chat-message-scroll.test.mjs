import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { observeChatMessageScroll } from '../src/features/chat-with-ai/model/message-scroll.ts';

const createFrameQueue = () => {
	let nextFrame = 1;
	const callbacks = new Map();
	return {
		request: callback => {
			const frame = nextFrame++;
			callbacks.set(frame, callback);
			return frame;
		},
		cancel: frame => callbacks.delete(frame),
		flush: () => {
			const pending = [...callbacks.values()];
			callbacks.clear();
			pending.forEach(callback => callback(0));
		},
		get size() { return callbacks.size; },
	};
};

const settleEffects = () => new Promise(resolve => setImmediate(resolve));

test('message and busy changes schedule scrolling using the latest untracked scroll preference', async t => {
	const frames = createFrameQueue();
	const viewport = { scrollTop: 0, scrollHeight: 240 };
	let setMessages;
	let setBusy;
	let setView;
	createRoot(dispose => {
		t.after(dispose);
		const [messages, updateMessages] = createSignal([{ id: 'first' }]);
		const [busy, updateBusy] = createSignal(false);
		const [view, updateView] = createSignal({ scrollTop: 30, follow: true });
		setMessages = updateMessages;
		setBusy = updateBusy;
		setView = updateView;
		observeChatMessageScroll({
			readMessages: messages,
			readBusy: busy,
			readView: view,
			getViewport: () => viewport,
			requestFrame: frames.request,
			cancelFrame: frames.cancel,
		});
	});

	await settleEffects();
	assert.equal(frames.size, 1);
	frames.flush();
	assert.equal(viewport.scrollTop, viewport.scrollHeight);

	setView({ scrollTop: 30, follow: false });
	await settleEffects();
	assert.equal(frames.size, 0);
	assert.equal(viewport.scrollTop, viewport.scrollHeight);

	setMessages([{ id: 'second' }]);
	await settleEffects();
	frames.flush();
	assert.equal(viewport.scrollTop, 30);

	setView({ scrollTop: 50, follow: true });
	await settleEffects();
	assert.equal(frames.size, 0);
	setBusy(true);
	await settleEffects();
	frames.flush();
	assert.equal(viewport.scrollTop, viewport.scrollHeight);
});

test('pending chat scroll work is cancelled when its owner is disposed', async t => {
	const frames = createFrameQueue();
	let setMessages;
	let dispose;
	createRoot(end => {
		dispose = end;
		const [messages, updateMessages] = createSignal([]);
		const [busy] = createSignal(false);
		const [view] = createSignal({ scrollTop: 0, follow: true });
		setMessages = updateMessages;
		observeChatMessageScroll({
			readMessages: messages,
			readBusy: busy,
			readView: view,
			getViewport: () => undefined,
			requestFrame: frames.request,
			cancelFrame: frames.cancel,
		});
	});
	t.after(dispose);

	await settleEffects();
	assert.equal(frames.size, 1);
	setMessages([{ id: 'next' }]);
	await settleEffects();
	assert.equal(frames.size, 1);
	dispose();
	assert.equal(frames.size, 0);
});
