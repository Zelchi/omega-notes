import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useKanban } from '../src/features/manage-kanban/model/controller.ts';
import { kanbanSlotCount } from '../src/features/manage-kanban/model/kanban.ts';
import { settle } from './helpers.mjs';

const setup = async (t, { failWrite = false, initialItems = [] } = {}) => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	if (initialItems.length) data.set('omega-notes.kanban.v1.vault-a', JSON.stringify(initialItems));
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => {
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
	return { kanban, data, setVaultId };
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
	assert.equal(await kanban.flushSave(), false);
});

test('app shutdown and vault deletion await the Kanban save checkpoint', async () => {
	const source = await readFile(new URL('../src/app/controller.ts', import.meta.url), 'utf8');
	const shutdown = source.slice(source.indexOf('const beforeShutdown = async'), source.indexOf('const windowControls', source.indexOf('const beforeShutdown = async')));
	const deletion = source.slice(source.indexOf('const deleteVault = async'), source.indexOf('\n\treturn {', source.indexOf('const deleteVault = async')));
	assert.match(shutdown, /await kanban\.flushSave\(\)/);
	assert.match(deletion, /await beforeShutdown\(\)/);
});
