import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useAiChat } from '../src/features/chat-with-ai/model/ai-chat.controller.ts';
import { deferred, settle } from './helpers.mjs';

const setup = async t => {
	const previousWindow = globalThis.window;
	const previousLocalStorage = globalThis.localStorage;
	let desktopEvent, receive;
	const sends = [], cancels = [], steers = [], completed = [];
	const storage = new Map();
	let applyImpl = async () => async () => { throw 'AI_NOTE_CHANGED'; };
	globalThis.localStorage = {
		getItem: key => storage.get(key) ?? null,
		setItem: (key, value) => storage.set(key, String(value)),
		removeItem: key => storage.delete(key),
	};
	globalThis.window = { omegaDesktop: {
		onEvent: handler => { desktopEvent = handler; return () => {}; },
		invoke: async (command, args) => {
			if (command === 'read_ai_chat') return { messages: [], referenceTitles: {}, draft: '', model: '', effort: '', fast: false };
			if (command === 'save_ai_chat') return;
			if (command === 'complete_ai_link_request') { completed.push(args); return; }
			throw Error(`Unexpected mocked desktop command: ${command}`);
		},
	} };
	let beforeSend = async () => true;
	let sendImpl = async () => ({ threadId: 'fake-thread' });
	let dispose;
	const status = { connected: true, authenticated: true, connectionId: 'fake-connection' };
	const provider = {
		id: 'codex', name: 'fake', labels: { connect: 'aiConnect', signInRequired: 'aiSignInRequired', signIn: 'aiSignIn' },
		connect: async () => status, status: async () => status, disconnect: async () => {},
		models: async () => [{ id: 'fake-model', name: 'Fake', isDefault: true, defaultEffort: 'balanced', efforts: ['balanced'], serviceTiers: [] }],
		signIn: async () => {},
		send: (...args) => { sends.push(args); return sendImpl(...args); },
		steer: async (...args) => { steers.push(args); return { turnId: 'fake-turn' }; },
		cancel: async (...args) => { cancels.push(args); },
		subscribe: async handler => { receive = handler; return () => {}; },
		errorKey: () => 'aiRequestFailed',
	};
	let controller, setVaultId;
	createRoot(stop => {
		dispose = stop;
		const [vaultId, changeVaultId] = createSignal('vault-a');
		setVaultId = changeVaultId;
		controller = useAiChat({
			provider, enabled: () => true, vaultId, notes: () => [], currentNote: () => undefined, notesReady: () => true,
			beforeSend: () => beforeSend(), applyLinkedMentions: (...args) => applyImpl(...args), t: key => key,
		});
	});
	t.after(() => {
		dispose();
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
		if (previousLocalStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousLocalStorage;
	});
	await settle();
	await controller.connect();
	await settle();
	return {
		controller, sends, cancels, steers, completed, setApplyImpl: value => { applyImpl = value; }, setBeforeSend: value => { beforeSend = value; },
		setSendImpl: value => { sendImpl = value; }, setVaultId,
		emitLinkRequest: request => desktopEvent('ai-link-request', request),
		complete: (vaultId, requestId) => receive({ kind: 'completed', connectionId: status.connectionId, vaultId, requestId }),
	};
};

const prepareUndoFallback = async fixture => {
	const { controller, emitLinkRequest, complete } = fixture;
	controller.setDraft('request links');
	await controller.send();
	const originalRequestId = controller.chat().requestId;
	emitLinkRequest({
		ticket: 'fake-ticket', connectionId: 'fake-connection', vaultId: 'vault-a', requestId: originalRequestId,
		patch: { operation: 'link', noteId: 'note-a', links: [{ id: 'note-b', label: 'Note B' }] },
	});
	await settle();
	controller.approveLinkRequest('fake-ticket');
	await settle();
	complete('vault-a', originalRequestId);
	await settle();
};

test('cancelling an unpublished undo-links fallback releases only its busy state', async t => {
	const fixture = await setup(t);
	const { controller, sends } = fixture;
	await prepareUndoFallback(fixture);
	controller.setDraft('draft preserved');
	const preparation = deferred();
	fixture.setBeforeSend(() => preparation.promise);
	const undoing = controller.undoLinks();
	await settle();
	assert.equal(controller.chat().busy, true);
	assert.equal(sends.length, 1);
	const fallbackRequestId = controller.chat().requestId;

	await controller.cancel();
	preparation.resolve(true);
	await undoing;

	assert.equal(controller.chat().busy, false);
	assert.equal(controller.chat().draft, 'draft preserved');
	assert.equal(controller.chat().messages.some(message => message.action === 'undo-links'), false);
	assert.equal(sends.length, 1);

	fixture.setBeforeSend(async () => true);
	await controller.send();
	assert.equal(sends.length, 2);
	assert.notEqual(controller.chat().requestId, fallbackRequestId);
});

test('a failed preparation releases its own unpublished request and restores a normal draft', async t => {
	const fixture = await setup(t);
	const { controller, sends } = fixture;
	controller.setDraft('retry me');
	fixture.setBeforeSend(async () => false);
	await controller.send();
	assert.equal(controller.chat().busy, false);
	assert.equal(controller.chat().draft, 'retry me');
	assert.equal(sends.length, 0);
});

test('cancelling preparation for an active turn does not clear its busy steering turn', async t => {
	const fixture = await setup(t);
	const { controller, cancels, sends, steers } = fixture;
	controller.setDraft('active turn');
	await controller.send();
	const activeRequestId = controller.chat().requestId;
	controller.setDraft('steering draft');
	const preparation = deferred();
	fixture.setBeforeSend(() => preparation.promise);
	const steering = controller.send();
	await settle();
	await controller.cancel();
	preparation.resolve(true);
	await steering;

	assert.equal(sends.length, 1);
	assert.equal(steers.length, 0);
	assert.equal(cancels.at(-1)?.[2], activeRequestId);
	assert.equal(controller.chat().requestId, activeRequestId);
	assert.equal(controller.chat().busy, true);
	assert.equal(controller.chat().draft, 'steering draft');
	fixture.complete('vault-a', activeRequestId);
	assert.equal(controller.chat().busy, false);
});

test('a published request stays busy until its provider completion', async t => {
	const fixture = await setup(t);
	const { controller, sends } = fixture;
	const sending = deferred();
	fixture.setSendImpl(() => sending.promise);
	controller.setDraft('published message');
	const send = controller.send();
	await settle();
	assert.equal(sends.length, 1);
	const requestId = controller.chat().requestId;
	assert.equal(controller.chat().busy, true);

	await controller.cancel();
	assert.equal(controller.chat().busy, true);
	fixture.complete('vault-a', requestId);
	assert.equal(controller.chat().busy, false);
	sending.resolve({ threadId: 'fake-thread' });
	await send;
	assert.equal(controller.chat().busy, false);
});

test('changing vault while beforeSend is pending prevents publishing into the new vault', async t => {
	const fixture = await setup(t);
	const { controller, sends } = fixture;
	controller.setDraft('old vault draft');
	const preparation = deferred();
	fixture.setBeforeSend(() => preparation.promise);
	const send = controller.send();
	await settle();
	fixture.setVaultId('vault-b');
	await settle();
	preparation.resolve(true);
	await send;

	assert.equal(sends.length, 0);
	assert.equal(controller.chat().busy, false);
	fixture.setVaultId('vault-a');
	await settle();
	assert.equal(controller.chat().busy, false);
	assert.equal(controller.chat().draft, 'old vault draft');
});

test('link requests wait for app approval and a rejection never applies a patch', async t => {
	const fixture = await setup(t);
	const { controller, completed } = fixture;
	let applied = 0;
	fixture.setApplyImpl(async () => { applied++; return async () => {}; });
	controller.setDraft('link the notes');
	await controller.send();
	const requestId = controller.chat().requestId;
	fixture.emitLinkRequest({
		ticket: 'approval-ticket', connectionId: 'fake-connection', vaultId: 'vault-a', requestId,
		patch: { operation: 'link', noteId: 'note-a', title: 'Note A', links: [{ id: 'note-b', title: 'Note B', reference: '[[note-b]]', label: 'Note B' }] },
	});
	await settle();
	assert.equal(controller.pendingLinkRequest()?.ticket, 'approval-ticket');
	assert.equal(applied, 0);
	assert.equal(completed.length, 0);

	controller.rejectLinkRequest('approval-ticket');
	await settle();
	assert.equal(applied, 0);
	assert.equal(completed.length, 1);
	assert.equal(completed[0].approved, false);
	assert.equal(completed[0].ticket, 'approval-ticket');
});

test('cancellation before approval rejects the link request without mutating', async t => {
	const fixture = await setup(t);
	const { controller, cancels, completed } = fixture;
	let applied = 0;
	fixture.setApplyImpl(async () => { applied++; return async () => {}; });
	controller.setDraft('link the notes');
	await controller.send();
	const requestId = controller.chat().requestId;
	fixture.emitLinkRequest({ ticket: 'cancel-ticket', connectionId: 'fake-connection', vaultId: 'vault-a', requestId,
		patch: { operation: 'link', noteId: 'note-a', title: 'Note A', links: [] } });
	await settle();
	await controller.cancel();
	assert.equal(applied, 0);
	assert.equal(completed.length, 1);
	assert.equal(completed[0].approved, false);
	assert.equal(cancels.at(-1)?.[2], requestId);
});

test('Stop waits for an approved link mutation to commit before cancelling the provider', async t => {
	const fixture = await setup(t);
	const { controller, cancels, completed } = fixture;
	const persistence = deferred();
	let validAtCommit = false;
	fixture.setApplyImpl(async (_patch, stillValid) => {
		validAtCommit = stillValid();
		await persistence.promise;
		return async () => {};
	});
	controller.setDraft('link the notes');
	await controller.send();
	const requestId = controller.chat().requestId;
	fixture.emitLinkRequest({ ticket: 'commit-ticket', connectionId: 'fake-connection', vaultId: 'vault-a', requestId,
		patch: { operation: 'link', noteId: 'note-a', title: 'Note A', links: [] } });
	await settle();
	controller.approveLinkRequest('commit-ticket');
	await settle();
	assert.equal(validAtCommit, true);
	assert.equal(completed.length, 0);

	const stopping = controller.cancel();
	await settle();
	assert.equal(cancels.length, 0);
	persistence.resolve();
	await stopping;
	assert.equal(completed.length, 1);
	assert.equal(completed[0].approved, true);
	assert.equal(cancels.at(-1)?.[2], requestId);
	assert.equal(controller.chat().messages.at(-1).text, 'aiLinksAppliedBeforeStop');
});

test('Stop after a committed link change preserves the success result before cancelling the provider', async t => {
	const fixture = await setup(t);
	const { controller, cancels, completed } = fixture;
	let committed = false;
	fixture.setApplyImpl(async () => { committed = true; return async () => {}; });
	controller.setDraft('link the notes');
	await controller.send();
	const requestId = controller.chat().requestId;
	fixture.emitLinkRequest({ ticket: 'committed-ticket', connectionId: 'fake-connection', vaultId: 'vault-a', requestId,
		patch: { operation: 'link', noteId: 'note-a', title: 'Note A', links: [] } });
	await settle();
	controller.approveLinkRequest('committed-ticket');
	await settle();
	assert.equal(committed, true);
	assert.equal(completed.length, 1);
	assert.equal(completed[0].approved, true);

	await controller.cancel();
	assert.equal(completed.length, 1);
	assert.equal(cancels.at(-1)?.[2], requestId);
	assert.equal(controller.chat().messages.at(-1).text, 'aiLinksAppliedBeforeStop');
});
