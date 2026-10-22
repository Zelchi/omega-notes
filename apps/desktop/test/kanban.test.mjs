import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useKanban } from '../src/features/manage-kanban/model/controller.ts';
import { settle } from './helpers.mjs';

const setup = async (t, { failWrite = false } = {}) => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => {
			if (failWrite && key.startsWith('omega-notes.kanban.')) throw Error('storage unavailable');
			data.set(key, String(value));
		},
	};
	let kanban;
	createRoot(dispose => {
		t.after(() => {
			dispose();
			if (previousStorage === undefined) delete globalThis.localStorage;
			else globalThis.localStorage = previousStorage;
		});
		const [vaultId] = createSignal('vault-a');
		kanban = useKanban(vaultId);
	});
	await settle();
	return { kanban, data };
};

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
