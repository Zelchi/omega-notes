import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfHighlightActions } from '../src/features/manage-pdfs/model/highlight-actions.ts';
import { deferred } from './helpers.mjs';

const fixture = () => {
	const initial = { id: 'old', page: 1, text: 'old', rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }], color: 'yellow', noteId: null };
	const state = {
		vault: 'vault-a', document: 'pdf-a', revision: 1, ready: new Set([1]),
		menu: { page: 1, selection: { text: 'new', rects: initial.rects } }, highlights: [initial],
		saving: false, error: undefined, selected: undefined, color: 'blue', noteId: 'note-1', closed: 0, cleared: 0,
	};
	const calls = [];
	const api = {
		add: async (...args) => { calls.push(['add', ...args]); return [args[2]]; },
		update: async (...args) => { calls.push(['update', ...args]); return [args[2]]; },
		remove: async (...args) => { calls.push(['remove', ...args]); return []; },
	};
	const actions = createPdfHighlightActions({
		vaultId: () => state.vault, documentId: () => state.document, revision: () => state.revision,
		menu: () => state.menu, readyPages: () => state.ready, highlights: () => state.highlights,
		saving: () => state.saving, editColor: () => state.color, editNoteId: () => state.noteId,
		setSaving: value => { state.saving = value; }, setError: value => { state.error = value; },
		setHighlights: value => { state.highlights = value; }, setSelected: value => { state.selected = value; },
		closeMenu: () => { state.closed++; }, clearSelection: () => { state.cleared++; },
		createId: () => 'new-id',
		add: (...args) => api.add(...args), update: (...args) => api.update(...args), remove: (...args) => api.remove(...args),
	});
	return { state, calls, api, ...actions };
};

test('create, edit and remove publish the returned highlights and keep the correct selection', async () => {
	const f = fixture();
	await f.saveSelectionAsHighlight();
	assert.equal(f.calls[0][3].id, 'new-id');
	assert.equal(f.calls[0][3].color, 'yellow');
	assert.equal(f.state.selected, 'new-id');
	assert.equal(f.state.cleared, 1);
	await f.saveHighlightEdit('new-id');
	assert.equal(f.calls[1][3].color, 'blue');
	assert.equal(f.calls[1][3].noteId, 'note-1');
	await f.removeHighlight('new-id');
	assert.deepEqual(f.state.highlights, []);
	assert.equal(f.state.selected, undefined);
	assert.equal(f.state.closed, 3);
	assert.equal(f.state.saving, false);
});

test('selection cannot be saved until its text layer is ready and concurrent writes are blocked', async () => {
	const f = fixture();
	f.state.ready.clear();
	await f.saveSelectionAsHighlight();
	assert.equal(f.calls.length, 0);
	f.state.ready.add(1);
	const gate = deferred();
	let count = 0;
	f.api.add = async () => { count++; return gate.promise; };
	const pending = f.saveSelectionAsHighlight();
	await f.saveSelectionAsHighlight();
	await f.removeHighlight('old');
	assert.equal(count, 1);
	assert.equal(f.calls.length, 0);
	gate.resolve([]);
	await pending;
	assert.equal(f.state.saving, false);
});

test('late results and errors from a previous document cannot mutate the current state', async () => {
	for (const reject of [false, true]) {
		const f = fixture();
		const gate = deferred();
		f.api.add = () => gate.promise;
		const pending = f.saveSelectionAsHighlight();
		f.state.revision++;
		f.state.vault = 'vault-b';
		f.state.document = 'pdf-b';
		f.state.saving = true;
		if (reject) gate.reject(Error('failed')); else gate.resolve([]);
		await pending;
		assert.equal(f.state.highlights[0].id, 'old');
		assert.equal(f.state.error, undefined);
		assert.equal(f.state.saving, true);
		assert.equal(f.state.closed, 0);
	}
});

test('persistence failures remain visible and allow retry for each operation', async () => {
	for (const [name, run, error] of [
		['add', f => f.saveSelectionAsHighlight(), 'pdfHighlightSaveFailed'],
		['update', f => f.saveHighlightEdit('old'), 'pdfHighlightUpdateFailed'],
		['remove', f => f.removeHighlight('old'), 'pdfHighlightDeleteFailed'],
	]) {
		const f = fixture();
		const original = f.api[name];
		f.api[name] = async () => { throw Error('failed'); };
		await run(f);
		assert.equal(f.state.error, error);
		assert.equal(f.state.saving, false);
		assert.equal(f.state.closed, 0);
		f.api[name] = original;
		await run(f);
		assert.equal(f.state.error, undefined);
		assert.equal(f.state.closed, 1);
	}
});
