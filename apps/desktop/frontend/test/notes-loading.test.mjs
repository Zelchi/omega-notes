import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useNotes } from '../src/entities/note/model/notes-library.ts';
import { deferred, mockDesktop, note, noteSummary } from './helpers.mjs';

const setup = (t, invoke) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	globalThis.window = { omegaDesktop: mockDesktop(invoke) };
	let library;
	createRoot(dispose => {
		t.after(() => {
			dispose();
			if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
			else delete globalThis.window;
		});
		const [vault] = createSignal('vault-a');
		library = useNotes(vault);
	});
	return library;
};

const waitFor = async predicate => {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	throw new Error('Timed out waiting for note loading');
};

const complete = { event: 'complete', data: { issues: [], referenceTitles: {} } };

test('vault is not marked loaded until all streamed note batches complete', async t => {
	const nextBatch = deferred();
	const library = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		args.onItem.onmessage({ event: 'item', data: noteSummary(note('first')) });
		await nextBatch.promise;
		args.onItem.onmessage({ event: 'item', data: noteSummary(note('second')) });
		args.onItem.onmessage(complete);
	});

	await waitFor(() => library.notes().length === 1);
	assert.equal(library.loading(), true);
	assert.equal(library.hasLoadedVault(), false);

	nextBatch.resolve();
	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), true);
	assert.deepEqual(library.notes().map(value => value.id), ['first', 'second']);
});

test('a failed stream after a partial batch does not mark the vault loaded', async t => {
	t.mock.method(console, 'error', () => {});
	const fail = deferred();
	const library = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		args.onItem.onmessage({ event: 'item', data: noteSummary(note('partial')) });
		await fail.promise;
		throw new Error('simulated stream failure');
	});

	await waitFor(() => library.notes().length === 1);
	assert.equal(library.hasLoadedVault(), false);
	fail.resolve();
	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), false);
	assert.deepEqual(library.notes(), []);
	assert.equal(library.loadIssues().length, 1);
});

test('an empty vault is marked loaded after the successful completion event', async t => {
	const library = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		args.onItem.onmessage(complete);
	});

	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), true);
	assert.deepEqual(library.notes(), []);
});
