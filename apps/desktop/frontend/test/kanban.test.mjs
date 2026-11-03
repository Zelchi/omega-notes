import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useKanban } from '../src/features/manage-kanban/model/controller.ts';
import { readKanban } from '../src/features/manage-kanban/api/kanban.repository.ts';
import { mockDesktop, settle } from './helpers.mjs';

const setup = async (t, { failRead = false, failWrite = false, initialData, initialItems = [], initialWipLimits } = {}) => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	const saved = initialData ?? (initialItems.length ? JSON.stringify(initialItems) : undefined);
	if (saved !== undefined) data.set('omega-notes.kanban.v1.vault-a', saved);
	if (initialWipLimits !== undefined) data.set('omega-notes.kanban.wip.v1.vault-a', JSON.stringify(initialWipLimits));
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
		removeItem: key => data.delete(key),
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
	description: '',
	noteId: null,
	status: ['backlog', 'toDo', 'inProgress', 'review', 'finish'][index % 5],
	position: Math.floor(index / 5),
	priority: 'none',
	labels: [],
	dueDate: null,
	createdAt: 1,
	updatedAt: null,
}));

test('all lanes start expanded for each vault', async t => {
	const { kanban, setVaultId } = await setup(t);
	assert.equal(kanban.view.collapsedStatuses().size, 0);

	setVaultId('vault-b');
	await settle();
	assert.equal(kanban.view.collapsedStatuses().size, 0);
});

test('hiding and reopening Kanban preserves its controller state', async t => {
	const { kanban } = await setup(t);
	kanban.add('Keep this card', 'backlog');
	kanban.view.setDraft('unfinished title');
	const before = kanban.items();

	kanban.setOpen(false);
	kanban.setOpen(true);

	assert.equal(kanban.open(), true);
	assert.deepEqual(kanban.items(), before);
	assert.equal(kanban.view.draft(), 'unfinished title');
});

test('resized panel width is retained when switching vaults', async t => {
	const { kanban, setVaultId } = await setup(t);
	kanban.setPanelWidth(620);

	setVaultId('vault-b');
	await settle();

	assert.equal(kanban.panelWidth(), 620);
});

test('updatedAt changes only when a card moves to another lane', async t => {
	const { kanban } = await setup(t);
	kanban.add('Task', 'backlog');
	const item = kanban.items()[0];
	assert.equal(item.updatedAt, null);

	kanban.rename(item.id, 'Renamed task');
	kanban.move(item.id, 'backlog', 0);
	assert.equal(kanban.items()[0].updatedAt, null);

	kanban.move(item.id, 'toDo', 0);
	assert.equal(kanban.items()[0].status, 'toDo');
	assert.ok(Number.isSafeInteger(kanban.items()[0].updatedAt));
});

test('new cards start with low priority and no linked note while preserving legacy descriptions', async t => {
	const { kanban, data } = await setup(t);
	kanban.add('Task', 'backlog');
	const [item] = kanban.items();
	assert.deepEqual([item.description, item.noteId, item.priority, item.labels, item.dueDate], ['', null, 'low', [], null]);

	kanban.update(item.id, {
		title: '  Updated task  ', noteId: '00000000-0000-4000-8000-000000000002', priority: 'high',
		labels: ['work', 'urgent'], dueDate: '2026-12-24',
	});
	assert.equal(await kanban.flushSave(), true);
	assert.deepEqual(kanban.items()[0], {
		...item, title: 'Updated task', noteId: '00000000-0000-4000-8000-000000000002', priority: 'high',
		labels: ['work', 'urgent'], dueDate: '2026-12-24',
	});
	assert.deepEqual(JSON.parse(data.get('omega-notes.kanban.v1.vault-a')).items[0].labels, ['work', 'urgent']);
});

test('a deleted card can be restored without losing its details', async t => {
	const { kanban } = await setup(t);
	kanban.add('Keep me', 'review');
	const [item] = kanban.items();
	kanban.update(item.id, { description: 'Details', priority: 'medium', labels: ['test'], dueDate: '2026-11-30' });
	const edited = kanban.items()[0];
	const removed = kanban.remove(item.id);
	assert.deepEqual(removed.item, edited);
	assert.equal(kanban.restore(removed), true);
	assert.equal(await kanban.flushSave(), true);
	assert.deepEqual(kanban.items(), [edited]);
});

test('a deleted card cannot be restored into a different vault', async t => {
	const { kanban, setVaultId } = await setup(t);
	kanban.add('Vault A card', 'backlog');
	const removed = kanban.remove(kanban.items()[0].id);
	setVaultId('vault-b');
	await settle();

	assert.equal(kanban.restore(removed), false);
	assert.deepEqual(kanban.items(), []);
});

test('moving between cards inserts at the target index and compacts the lane', async t => {
	const { kanban } = await setup(t);
	kanban.add('First', 'backlog');
	kanban.add('Second', 'backlog');
	kanban.add('Third', 'backlog');
	const [first, second, third] = kanban.items();

	kanban.move(third.id, 'backlog', 1);

	assert.deepEqual([...kanban.items()].sort((left, right) => left.position - right.position).map(({ title, position }) => [title, position]), [
		['First', 0],
		['Third', 1],
		['Second', 2],
	]);
});

test('moving into another lane inserts and closes the source gap', async t => {
	const { kanban } = await setup(t);
	kanban.add('First', 'backlog');
	kanban.add('Second', 'backlog');
	kanban.add('Target first', 'toDo');
	kanban.add('Target second', 'toDo');
	const [first, second, targetFirst, targetSecond] = kanban.items();

	kanban.move(second.id, 'toDo', 1);

	assert.deepEqual(kanban.items().filter(item => item.status === 'backlog').sort((left, right) => left.position - right.position).map(({ title, position }) => [title, position]), [
		['First', 0],
	]);
	assert.deepEqual(kanban.items().filter(item => item.status === 'toDo').sort((left, right) => left.position - right.position).map(({ title, position }) => [title, position]), [
		['Target first', 0],
		['Second', 1],
		['Target second', 2],
	]);
	assert.ok(kanban.items().find(item => item.id === second.id).updatedAt >= second.createdAt);
	assert.equal(kanban.items().find(item => item.id === first.id).position, 0);
	assert.equal(kanban.items().find(item => item.id === targetFirst.id).position, 0);
	assert.equal(kanban.items().find(item => item.id === targetSecond.id).position, 2);
});

test('legacy creation timestamps are not shown as category moves', async t => {
	const [legacyItem] = makeItems(1);
	delete legacyItem.description;
	delete legacyItem.noteId;
	delete legacyItem.priority;
	delete legacyItem.labels;
	delete legacyItem.dueDate;
	legacyItem.updatedAt = legacyItem.createdAt;
	const { kanban } = await setup(t, { initialItems: [legacyItem] });
	assert.equal(kanban.items()[0].updatedAt, null);
	assert.deepEqual([kanban.items()[0].description, kanban.items()[0].noteId, kanban.items()[0].priority, kanban.items()[0].labels, kanban.items()[0].dueDate], ['', null, 'none', [], null]);
});

test('legacy WIP limits migrate into the vault Kanban file', async t => {
	const { kanban, data } = await setup(t, { initialItems: makeItems(1), initialWipLimits: { inProgress: 3 } });
	assert.deepEqual(kanban.wipLimits(), { inProgress: 3 });
	const saved = JSON.parse(data.get('omega-notes.kanban.v1.vault-a'));
	assert.equal(saved.items.length, 1);
	assert.deepEqual(saved.wipLimits, { inProgress: 3 });
	assert.equal(data.has('omega-notes.kanban.wip.v1.vault-a'), false);
});

test('legacy WIP limits migrate through the desktop vault command', async t => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	const storage = new Map([['omega-notes.kanban.wip.v1.vault-desktop', JSON.stringify({ review: 2 })]]);
	const saves = [];
	globalThis.localStorage = {
		getItem: key => storage.get(key) ?? null,
		removeItem: key => storage.delete(key),
	};
	globalThis.window = { omegaDesktop: mockDesktop(async (command, args) => {
		if (command === 'read_kanban') return { items: [], wipLimits: {} };
		if (command === 'save_kanban') { saves.push(args); return null; }
		throw Error(`Unexpected command: ${command}`);
	}) };
	t.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
		else delete globalThis.window;
		if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
		else delete globalThis.localStorage;
	});

	const data = await readKanban('vault-desktop');

	assert.deepEqual(data, { items: [], wipLimits: { review: 2 } });
	assert.deepEqual(saves, [{ vaultId: 'vault-desktop', items: [], wipLimits: { review: 2 } }]);
	assert.equal(storage.has('omega-notes.kanban.wip.v1.vault-desktop'), false);
});

test('WIP limits persist per vault and can be cleared', async t => {
	const { kanban, setVaultId } = await setup(t);
	kanban.setWipLimit('inProgress', 3);
	assert.deepEqual(kanban.wipLimits(), { inProgress: 3 });
	assert.equal(await kanban.flushSave(), true);

	setVaultId('vault-b');
	await settle();
	assert.deepEqual(kanban.wipLimits(), {});
	kanban.setWipLimit('review', 4);
	assert.equal(await kanban.flushSave(), true);

	setVaultId('vault-a');
	await settle();
	assert.deepEqual(kanban.wipLimits(), { inProgress: 3 });
	kanban.setWipLimit('inProgress', undefined);
	assert.deepEqual(kanban.wipLimits(), {});
	assert.equal(await kanban.flushSave(), true);

	kanban.setWipLimit('review', 6);
	kanban.setWipLimit('review', 0);
	assert.deepEqual(kanban.wipLimits(), {});
	assert.equal(await kanban.flushSave(), true);
});

test('WIP limits are informational and do not block adding or moving cards', async t => {
	const { kanban } = await setup(t);
	kanban.setWipLimit('inProgress', 1);
	assert.equal(await kanban.flushSave(), true);
	kanban.add('First', 'inProgress');
	kanban.add('Second', 'inProgress');
	kanban.add('Queued', 'backlog');
	const queued = kanban.items().find(item => item.title === 'Queued');
	kanban.move(queued.id, 'inProgress', 2);
	assert.equal(await kanban.flushSave(), true);
	assert.equal(kanban.items().filter(item => item.status === 'inProgress').length, 3);
	assert.deepEqual(kanban.wipLimits(), { inProgress: 1 });
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
	assert.equal(JSON.parse(data.get('omega-notes.kanban.v1.vault-a')).items.length, 1);
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
	assert.deepEqual(JSON.parse(data.get('omega-notes.kanban.v1.vault-a')).items.map(({ title }) => title), ['Task 1', 'New task']);
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
