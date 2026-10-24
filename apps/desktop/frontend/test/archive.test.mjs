import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readArchiveState, saveArchiveState } from '../src/pages/canvas/ui/archive-view/archive.repository.ts';

const setupStorage = (t, shouldFail) => {
	const previousWindow = globalThis.window;
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	globalThis.window = {};
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => {
			if (shouldFail()) throw Error('storage unavailable');
			data.set(key, String(value));
		},
	};
	t.after(() => {
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	});
	return data;
};

test('archive save failure can be retried without losing the edited state', t => {
	let fail = true;
	const data = setupStorage(t, () => fail);
	const edited = { folders: [{ id: 'folder', name: 'Folder' }], noteFolders: {}, itemOrder: { '': [{ kind: 'folder', id: 'folder' }] } };

	assert.equal(saveArchiveState('vault-a', edited), false);
	fail = false;
	assert.equal(saveArchiveState('vault-a', edited), true);
	assert.deepEqual(JSON.parse(data.get('omega-notes.archive.vault-a')), edited);
	assert.equal(readArchiveState('vault-a').folders[0].name, 'Folder');
});

test('Archive view surfaces save failure and retries the current state', async () => {
	const source = await readFile(new URL('../src/pages/canvas/ui/archive-view/index.tsx', import.meta.url), 'utf8');
	assert.match(source, /archiveSaveFailed/);
	assert.match(source, /saveArchiveState\(props\.vaultId, state\(\)\)/);
	assert.match(source, /props\.t\("retry"\)/);
});
