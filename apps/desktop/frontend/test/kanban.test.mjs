import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useKanban } from '../src/features/manage-kanban/model/controller.ts';
import { kanbanSlotCount } from '../src/features/manage-kanban/model/kanban.ts';
import { settle } from './helpers.mjs';

const setup = async (t, { failRead = false, failWrite = false, initialData, initialItems = [] } = {}) => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	const saved = initialData ?? (initialItems.length ? JSON.stringify(initialItems) : undefined);
	if (saved !== undefined) data.set('omega-notes.kanban.v1.vault-a', saved);
	let readFailure = failRead;
	let writes = 0;
	globalThis.localStorage = {
		getItem: key => {
			if (readFailure && key.startsWith('omega-notes.kanban.')) throw Error('storage unavailable');
			return data.get(key) ?? null;
		},
		setItem: (key, value) => {
			writes += 1;
			if (failWrite && key.startsWith('omega-notes.kanban.')) throw Error('storage unavailable');
			data.set(key, String(value));
		},
	};
	let kanban, setVaultId;
	createRoot(dispose => {
		t.after(() => {
			dispose();
			if (previousStorage === undefined) delete globalThis.localStorage;
			else globalThis.localStorage = previousStorage;
		});
		const [vaultId, setVault] = createSignal('vault-a');
		setVaultId = setVault;
		kanban = useKanban(vaultId);
	});
	await settle();
	return { kanban, data, setVaultId, setReadFailure: value => { readFailure = value; }, writes: () => writes };
};

const makeItems = count => Array.from({ length: count }, (_, index) => ({
	id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
	title: `Task ${index + 1}`,
	status: ['backlog', 'toDo', 'inProgress', 'review', 'finish'][index % 5],
	position: Math.floor(index / 5),
	createdAt: 1,
	updatedAt: null,
}));

test('a lane adds a slot only after its last visible slot is occupied', () => {
	assert.equal(kanbanSlotCount(-1), 5);
	assert.equal(kanbanSlotCount(3), 5);
	assert.equal(kanbanSlotCount(4), 6);
	assert.equal(kanbanSlotCount(5), 7);
	assert.equal(kanbanSlotCount(1000), 1001);
});

test('all lanes start expanded for each vault', async t => {
	const { kanban, setVaultId } = await setup(t);
	assert.equal(kanban.view.collapsedStatuses().size, 0);

	setVaultId('vault-b');
	await settle();
	assert.equal(kanban.view.collapsedStatuses().size, 0);
});

test('updatedAt changes only when a card moves to another lane', async t => {
	const { kanban } = await setup(t);
	kanban.add('Task', 'backlog');
	const item = kanban.items()[0];
	assert.equal(item.updatedAt, null);

	kanban.rename(item.id, 'Renamed task');
	kanban.move(item.id, 'backlog', 1);
	assert.equal(kanban.items()[0].updatedAt, null);

	kanban.move(item.id, 'toDo', 0);
	assert.equal(kanban.items()[0].status, 'toDo');
	assert.ok(Number.isSafeInteger(kanban.items()[0].updatedAt));
});

test('moving onto another card swaps their positions in the same lane', async t => {
	const { kanban } = await setup(t);
	kanban.add('First', 'backlog');
	kanban.add('Second', 'backlog');
	const [first, second] = kanban.items();

	kanban.move(first.id, 'backlog', second.position, second.id);

	assert.deepEqual(kanban.items().map(({ title, position }) => [title, position]), [
		['First', 1],
		['Second', 0],
	]);
});

test('moving onto another card swaps their lanes and positions', async t => {
	const { kanban } = await setup(t);
	kanban.add('First', 'backlog');
	kanban.add('Second', 'toDo');
	const [first, second] = kanban.items();

	kanban.move(first.id, second.status, second.position, second.id);

	assert.deepEqual(kanban.items().map(({ title, status, position }) => [title, status, position]), [
		['First', 'toDo', 0],
		['Second', 'backlog', 0],
	]);
});

test('legacy creation timestamps are not shown as category moves', async t => {
	const [legacyItem] = makeItems(1);
	legacyItem.updatedAt = legacyItem.createdAt;
	const { kanban } = await setup(t, { initialItems: [legacyItem] });
	assert.equal(kanban.items()[0].updatedAt, null);
});

test('adding is capped at the storage limit', async t => {
	const { kanban } = await setup(t, { initialItems: makeItems(1000) });
	assert.equal(kanban.items().length, 1000);

	kanban.add('One too many', 'backlog');
	assert.equal(kanban.items().length, 1000);
});

test('flushSave waits for the active vault write', async t => {
	const { kanban, data } = await setup(t);
	kanban.add('Task', 'backlog');

	assert.equal(await kanban.flushSave(), true);
	assert.equal(JSON.parse(data.get('omega-notes.kanban.v1.vault-a')).length, 1);
});

test('flushSave reports pending and previous write failures', async t => {
	const { kanban } = await setup(t, { failWrite: true });
	kanban.add('Task', 'backlog');

	assert.equal(await kanban.flushSave(), false);
	assert.equal(kanban.error(), true);
	assert.equal(kanban.readFailed(), false);
	assert.equal(await kanban.flushSave(), false);
});

test('mutations stay blocked after a failed read until an explicit retry succeeds', async t => {
	const fixture = makeItems(1);
	const original = JSON.stringify(fixture);
	const { kanban, data, setReadFailure, writes } = await setup(t, { failRead: true, initialItems: fixture });
	const [item] = fixture;

	assert.equal(kanban.readFailed(), true);
	assert.equal(kanban.error(), false);
	kanban.add('New task', 'backlog');
	kanban.rename(item.id, 'Renamed task');
	kanban.move(item.id, 'toDo', 0);
	kanban.remove(item.id);
	await settle();

	assert.equal(writes(), 0);
	assert.equal(data.get('omega-notes.kanban.v1.vault-a'), original);

	setReadFailure(false);
	kanban.retryRead();
	await settle();
	assert.equal(kanban.readFailed(), false);
	assert.deepEqual(kanban.items(), fixture);

	kanban.add('New task', 'backlog');
	assert.equal(await kanban.flushSave(), true);
	assert.equal(writes(), 1);
	assert.deepEqual(JSON.parse(data.get('omega-notes.kanban.v1.vault-a')).map(({ title }) => title), ['Task 1', 'New task']);
});

test('mutations stay blocked while a new vault is loading', async t => {
	const fixture = makeItems(1);
	const { kanban, data, setVaultId, writes } = await setup(t);
	const key = 'omega-notes.kanban.v1.vault-b';
	data.set(key, JSON.stringify(fixture));

	setVaultId('vault-b');
	assert.equal(kanban.loading(), true);
	kanban.add('New task', 'backlog');
	kanban.rename(fixture[0].id, 'Renamed task');
	kanban.move(fixture[0].id, 'toDo', 0);
	kanban.remove(fixture[0].id);
	await settle();

	assert.equal(kanban.loading(), false);
	assert.equal(writes(), 0);
	assert.equal(data.get(key), JSON.stringify(fixture));
	assert.deepEqual(kanban.items(), fixture);
});

test('invalid Kanban data is preserved after a failed read', async t => {
	const original = '{invalid json';
	const { kanban, data, writes } = await setup(t, { initialData: original });

	assert.equal(kanban.readFailed(), true);
	kanban.add('New task', 'backlog');
	await settle();

	assert.equal(writes(), 0);
	assert.equal(data.get('omega-notes.kanban.v1.vault-a'), original);
});

test('a stale read retry cannot replace a newly selected vault', async t => {
	const firstVaultItems = makeItems(1);
	const secondVaultItems = makeItems(2);
	const { kanban, data, setReadFailure, setVaultId, writes } = await setup(t, { failRead: true, initialItems: firstVaultItems });
	const secondVaultKey = 'omega-notes.kanban.v1.vault-b';
	data.set(secondVaultKey, JSON.stringify(secondVaultItems));

	setReadFailure(false);
	kanban.retryRead();
	setVaultId('vault-b');
	await settle();

	assert.equal(writes(), 0);
	assert.deepEqual(kanban.items(), secondVaultItems);
	assert.equal(kanban.readFailed(), false);
});

test('app shutdown and vault deletion await the Kanban save checkpoint', async () => {
	const source = await readFile(new URL('../src/app/controller.ts', import.meta.url), 'utf8');
	const shutdown = source.slice(source.indexOf('const beforeShutdown = async'), source.indexOf('const windowControls', source.indexOf('const beforeShutdown = async')));
	const deletion = source.slice(source.indexOf('const deleteVault = async'), source.indexOf('\n\treturn {', source.indexOf('const deleteVault = async')));
	assert.match(shutdown, /await kanban\.flushSave\(\)/);
	assert.match(deletion, /await beforeShutdown\(\)/);
});
