import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal, createRenderEffect } from 'solid-js';
import { useNotes } from '../src/entities/note/model/notes-library.ts';
import { invokeCancellable, withCancellableReadsPaused } from '../src/shared/lib/desktop.ts';
import { deferred, mockDesktop, note, noteSummary } from './helpers.mjs';

const setup = (t, invoke) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	globalThis.window = { omegaDesktop: mockDesktop(invoke) };
	let library, fixture;
	createRoot(dispose => {
		t.after(() => {
			dispose();
			if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
			else delete globalThis.window;
		});
		const [vault, setVault] = createSignal('vault-a');
		library = useNotes(vault);
		fixture = { setVault, vault };
	});
	return { ...fixture, library };
};

const waitFor = async predicate => {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	throw new Error('Timed out waiting for note loading');
};

const complete = { event: 'complete', data: { issues: [], referenceTitles: {} } };

test('renderers never see the new vault as ready with notes from the previous vault', async t => {
	const secondRead = deferred();
	const { library, setVault, vault } = setup(t, async (command, args) => {
		if (command === 'cancel_note_read') return;
		assert.equal(command, 'stream_note_summaries');
		if (args.vaultId === 'vault-b') await secondRead.promise;
		args.onItem.onmessage({ event: 'item', data: noteSummary(note(args.vaultId)) });
		args.onItem.onmessage(complete);
	});
	await waitFor(() => library.hasLoadedVault());
	const frames = [];
	createRoot(dispose => {
		t.after(dispose);
		createRenderEffect(() => {
			const id = vault();
			if (library.hasLoadedVault()) frames.push({ vault: id, notes: library.notes().map(note => note.id) });
		});
	});
	setVault('vault-b');
	assert.deepEqual(frames, [{ vault: 'vault-a', notes: ['vault-a'] }]);
	secondRead.resolve();
	await waitFor(() => library.hasLoadedVault());
	assert.deepEqual(frames.at(-1), { vault: 'vault-b', notes: ['vault-b'] });
});

test('summary events delivered after the RPC response still complete the vault load', async t => {
	const calls = [];
	const { library } = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		calls.push(args);
	});
	await waitFor(() => calls.length === 1);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(library.loading(), true);
	calls[0].onItem.onmessage({ event: 'item', data: noteSummary(note('late-note')) });
	calls[0].onItem.onmessage(complete);
	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), true);
	assert.deepEqual(library.notes().map(value => value.id), ['late-note']);
	calls[0].onItem.onmessage({ event: 'item', data: noteSummary(note('after-complete')) });
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(library.notes().map(value => value.id), ['late-note']);
});

test('vault is not marked loaded until all streamed note batches complete', async t => {
	const nextBatch = deferred();
	const { library } = setup(t, async (command, args) => {
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
	const { library } = setup(t, async (command, args) => {
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
	const { library } = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		args.onItem.onmessage(complete);
	});

	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), true);
	assert.deepEqual(library.notes(), []);
});

test('returning to a vault retries a transient NOTE_READ_FAILED and loads its notes', async t => {
	let firstVaultAttempts = 0;
	const { library, setVault } = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		if (args.vaultId === 'vault-a' && ++firstVaultAttempts === 2) throw Error('NOTE_READ_FAILED');
		const id = args.vaultId === 'vault-a' ? 'returned-note' : 'other-vault-note';
		args.onItem.onmessage({ event: 'item', data: noteSummary(note(id)) });
		args.onItem.onmessage(complete);
	});

	await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'returned-note'));
	setVault('vault-b');
	await waitFor(() => library.loading());
	await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'other-vault-note'));
	setVault('vault-a');
	await waitFor(() => library.loading());
	await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'returned-note'));
	assert.equal(library.hasLoadedVault(), true);
	assert.equal(firstVaultAttempts, 3);
	assert.deepEqual(library.notes().map(value => value.id), ['returned-note']);
	assert.deepEqual(library.loadIssues(), []);
});

test('changing vault cancels the obsolete backend stream', async t => {
	const firstStream = deferred();
	const calls = [], cancelled = [];
	const { library, setVault } = setup(t, async (command, args) => {
		calls.push({ command, args });
		if (command === 'cancel_note_read') { cancelled.push(args.operationId); return; }
		assert.equal(command, 'stream_note_summaries');
		if (args.vaultId === 'vault-a') return firstStream.promise;
		args.onItem.onmessage(complete);
	});
	await waitFor(() => calls.some(call => call.command === 'stream_note_summaries'));
	const firstOperationId = calls.find(call => call.command === 'stream_note_summaries').args.operationId;
	setVault('vault-b');
	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), true);
	assert.deepEqual(cancelled, [firstOperationId]);
	assert.deepEqual(library.loadIssues(), []);
});

test('late stream events from the first A read cannot leak after A-to-B-to-A', async t => {
	const firstRead = deferred();
	const streams = [], cancelled = [];
	const { library, setVault } = setup(t, async (command, args) => {
		if (command === 'cancel_note_read') { cancelled.push(args.operationId); return; }
		assert.equal(command, 'stream_note_summaries');
		streams.push(args);
		if (streams.length === 1) return firstRead.promise;
		const id = args.vaultId === 'vault-b' ? 'note-b' : 'note-a-current';
		args.onItem.onmessage({ event: 'item', data: noteSummary(note(id)) });
		args.onItem.onmessage(complete);
	});

	await waitFor(() => streams.length === 1);
	setVault('vault-b');
	await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'note-b'));
	setVault('vault-a');
	await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'note-a-current'));

	const oldOperationId = streams[0].operationId;
	streams[0].onItem.onmessage({ event: 'item', data: noteSummary(note('stale-a-note')) });
	streams[0].onItem.onmessage(complete);
	firstRead.resolve();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(cancelled, [oldOperationId]);
	assert.deepEqual(library.notes().map(value => value.id), ['note-a-current']);
	assert.deepEqual(library.loadIssues(), []);
});

test('vault switching waits for cancellation acknowledgment, not the read worker', async t => {
	const readWorker = deferred(), cancelAck = deferred();
	const calls = [];
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	globalThis.window = { omegaDesktop: mockDesktop((command, args) => {
		calls.push(command);
		if (command === 'stream_note_summaries') return readWorker.promise;
		if (command === 'cancel_note_read') return cancelAck.promise;
		throw new Error(`Unexpected command: ${command}`);
	}) };
	t.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
		else delete globalThis.window;
	});

	const request = invokeCancellable('stream_note_summaries', { vaultId: 'vault-a' }, new AbortController().signal);
	const cancelledRequest = assert.rejects(request, /NOTE_READ_CANCELLED/);
	await waitFor(() => calls.includes('stream_note_summaries'));
	let switched = false;
	const switching = withCancellableReadsPaused('vault-a', async () => { switched = true; });
	await waitFor(() => calls.includes('cancel_note_read'));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(switched, false);
	cancelAck.resolve();
	await switching;
	await cancelledRequest;
	assert.equal(switched, true);
	assert.deepEqual(calls, ['stream_note_summaries', 'cancel_note_read']);
	readWorker.resolve();
});

test('reloading the still-active vault starts a fresh summary read', async t => {
	const firstRead = deferred();
	let attempts = 0;
	const { library } = setup(t, async (command, args) => {
		if (command === 'cancel_note_read') return;
		assert.equal(command, 'stream_note_summaries');
		attempts++;
		if (attempts === 1) return firstRead.promise;
		args.onItem.onmessage(complete);
	});
	await waitFor(() => attempts === 1);
	library.reload();
	await waitFor(() => library.hasLoadedVault());
	assert.equal(attempts, 2);
	assert.deepEqual(library.loadIssues(), []);
	firstRead.resolve();
});

test('a failed vault load remains retryable after dismissing the error', async t => {
	t.mock.method(console, 'error', () => {});
	let attempts = 0;
	const { library } = setup(t, async (command, args) => {
		assert.equal(command, 'stream_note_summaries');
		if (++attempts === 1) throw Error('simulated vault read failure');
		args.onItem.onmessage({ event: 'item', data: noteSummary(note('recovered-note')) });
		args.onItem.onmessage(complete);
	});
	await waitFor(() => !library.loading());
	assert.equal(library.hasLoadedVault(), false);
	assert.equal(library.loadIssues().length, 1);
	library.dismissLoadIssues();
	assert.deepEqual(library.loadIssues(), []);
	assert.equal(library.hasLoadedVault(), false);
	library.reload();
	await waitFor(() => library.hasLoadedVault());
	assert.equal(attempts, 2);
	assert.deepEqual(library.notes().map(value => value.id), ['recovered-note']);
});
