import assert from 'node:assert/strict';
import test from 'node:test';
import { readBackgroundIntensity, saveBackgroundIntensity, readCanvasLayout, saveCanvasLayout } from '../src/features/change-preferences/api/preferences.repository.ts';
import { usePreferences } from '../src/features/change-preferences/model/preferences.controller.ts';

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

test('supported canvas layouts are persisted', t => {
	const data = storage(t);
	saveCanvasLayout('static');
	assert.equal(data.get('omega-notes.canvas-layout'), 'static');
	saveCanvasLayout('dynamic');
	assert.equal(data.get('omega-notes.canvas-layout'), 'dynamic');
});

test('unsupported legacy canvas layout falls back to dynamic', t => {
	const data = storage(t);
	data.set('omega-notes.canvas-layout', 'archive');
	assert.equal(readCanvasLayout(), 'dynamic');
});

test('background intensity defaults, persists, and clamps saved values', t => {
	const data = storage(t);
	assert.equal(readBackgroundIntensity(), 0.6);
	saveBackgroundIntensity(0.8);
	assert.equal(readBackgroundIntensity(), 0.8);
	data.set('omega-notes.settings.background-intensity', '2');
	assert.equal(readBackgroundIntensity(), 1);
	data.set('omega-notes.settings.background-intensity', '-1');
	assert.equal(readBackgroundIntensity(), 0);
	data.set('omega-notes.settings.background-intensity', 'invalid');
	assert.equal(readBackgroundIntensity(), 0.6);
});

test('changing background intensity updates and persists immediately', t => {
	storage(t);
	const previousDocument = globalThis.document;
	globalThis.document = {
		documentElement: {
			dataset: {},
			style: { colorScheme: '' },
		},
	};
	t.after(() => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	});

	const preferences = usePreferences();
	preferences.setBackgroundIntensity(0.2);
	assert.equal(preferences.backgroundIntensity(), 0.2);
	assert.equal(readBackgroundIntensity(), 0.2);
});
