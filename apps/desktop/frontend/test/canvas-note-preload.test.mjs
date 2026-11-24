import assert from 'node:assert/strict';
import test from 'node:test';
import { beginCanvasNotePointerInteraction } from '../src/pages/canvas/model/preload-note.ts';

const runInteraction = ({ button = 0, isOnNote = true, ignored = false } = {}) => {
	const calls = [];
	beginCanvasNotePointerInteraction({
		noteId: 'note-1',
		button,
		isOnNote,
		shouldIgnoreClick: () => ignored,
		preloadNote: id => calls.push(`preload:${id}`),
		beginGesture: () => calls.push('begin-gesture'),
	});
	return calls;
};

test('primary pointer down on a note preloads before starting its gesture', () => {
	assert.deepEqual(runInteraction(), ['preload:note-1', 'begin-gesture']);
});

test('secondary clicks and ignored clicks start the gesture without preloading', () => {
	assert.deepEqual(runInteraction({ button: 2 }), ['begin-gesture']);
	assert.deepEqual(runInteraction({ ignored: true }), ['begin-gesture']);
});

test('a dynamic-graph hit outside the node does not preload but still starts the board gesture', () => {
	assert.deepEqual(runInteraction({ isOnNote: false }), ['begin-gesture']);
});
