import assert from 'node:assert/strict';
import test from 'node:test';
import { readCanvasLayout, saveCanvasLayout } from '../src/features/change-preferences/api/preferences.repository.ts';

const storage = t => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => data.set(key, String(value)),
	};
	t.after(() => {
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	});
	return data;
};

test('archive layout preference is saved without falling back to dynamic', t => {
	const data = storage(t);
	saveCanvasLayout('archive');
	assert.equal(data.get('omega-notes.canvas-layout'), 'archive');
});

test('previously saved archive layout remains selected', t => {
	const data = storage(t);
	data.set('omega-notes.canvas-layout', 'archive');
	assert.equal(readCanvasLayout(), 'archive');
});
