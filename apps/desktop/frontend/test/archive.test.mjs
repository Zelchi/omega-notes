import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readArchiveState, saveArchiveState } from '../src/pages/canvas/ui/archive-view/archive.repository.ts';

const keyFor = vaultId => `omega-notes.archive.${encodeURIComponent(vaultId)}`;
const emptyState = () => ({ folders: [], noteFolders: {}, itemOrder: {} });

const setupStorage = (t, { readError = () => false, writeError = () => false, initialEntries = [] } = {}) => {
	const previousWindow = globalThis.window;
	const previousStorage = globalThis.localStorage;
	const data = new Map(initialEntries);
	const writes = [];
	globalThis.window = {};
	globalThis.localStorage = {
		getItem: key => {
			if (readError(key)) throw Error('storage unavailable');
			return data.get(key) ?? null;
		},
		setItem: (key, value) => {
			writes.push([key, String(value)]);
			if (writeError(key)) throw Error('storage unavailable');
			data.set(key, String(value));
		},
	};
	t.after(() => {
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	});
	return { data, writes };
};

test('archive save failure can be retried without losing the edited state', t => {
	let fail = true;
	const { data } = setupStorage(t, { writeError: () => fail });
	const edited = { folders: [{ id: 'folder', name: 'Folder' }], noteFolders: {}, itemOrder: { '': [{ kind: 'folder', id: 'folder' }] } };

	assert.equal(saveArchiveState('vault-a', edited), false);
	fail = false;
	assert.equal(saveArchiveState('vault-a', edited), true);
	assert.deepEqual(JSON.parse(data.get('omega-notes.archive.vault-a')), edited);
	const result = readArchiveState('vault-a');
	assert.equal(result.ok, true);
	assert.equal(result.state.folders[0].name, 'Folder');
});

test('an absent archive is a valid empty state that can be saved', t => {
	const { data } = setupStorage(t);
	const result = readArchiveState('vault-a');

	assert.deepEqual(result, { ok: true, state: emptyState() });
	assert.equal(saveArchiveState('vault-a', result.state), true);
	assert.deepEqual(JSON.parse(data.get(keyFor('vault-a'))), emptyState());
});

test('invalid archive JSON is reported without overwriting the original value', t => {
	const original = '{ invalid json';
	const { data, writes } = setupStorage(t, { initialEntries: [[keyFor('vault-a'), original]] });

	assert.deepEqual(readArchiveState('vault-a'), { ok: false, state: emptyState() });
	assert.equal(writes.length, 0);
	assert.equal(data.get(keyFor('vault-a')), original);
});

test('a transient read error can recover the saved archive without writing a fallback', t => {
	let failRead = true;
	const saved = {
		folders: [{ id: 'folder-a', name: 'Folder A' }],
		noteFolders: { 'note-a': 'folder-a' },
		itemOrder: { '': [{ kind: 'folder', id: 'folder-a' }], 'folder-a': [{ kind: 'note', id: 'note-a' }] },
	};
	const original = JSON.stringify(saved);
	const { data, writes } = setupStorage(t, {
		readError: () => failRead,
		initialEntries: [[keyFor('vault-a'), original]],
	});

	assert.deepEqual(readArchiveState('vault-a'), { ok: false, state: emptyState() });
	assert.equal(writes.length, 0);
	assert.equal(data.get(keyFor('vault-a')), original);

	failRead = false;
	const recovered = readArchiveState('vault-a');
	assert.equal(recovered.ok, true);
	assert.deepEqual(recovered.state, {
		...saved,
		folders: [{ id: 'folder-a', name: 'Folder A', parentFolderId: undefined }],
	});
	assert.equal(writes.length, 0);
	assert.equal(data.get(keyFor('vault-a')), original);
	assert.equal(saveArchiveState('vault-a', recovered.state), true);
	const persisted = JSON.parse(data.get(keyFor('vault-a')));
	assert.deepEqual(persisted.folders, saved.folders);
	assert.deepEqual(persisted.noteFolders, saved.noteFolders);
	assert.deepEqual(persisted.itemOrder, saved.itemOrder);
});

test('archive state remains isolated by vault', t => {
	const stateFor = name => ({ folders: [{ id: name, name }], noteFolders: {}, itemOrder: {} });
	setupStorage(t, {
		initialEntries: [
			[keyFor('vault-a'), JSON.stringify(stateFor('A'))],
			[keyFor('vault-b'), JSON.stringify(stateFor('B'))],
		],
	});

	assert.equal(readArchiveState('vault-a').state.folders[0].name, 'A');
	assert.equal(readArchiveState('vault-b').state.folders[0].name, 'B');
});

test('Archive view surfaces save failure and retries the current state', async () => {
	const source = await readFile(new URL('../src/pages/canvas/ui/archive-view/index.tsx', import.meta.url), 'utf8');
	assert.match(source, /archiveSaveFailed/);
	assert.match(source, /saveArchiveState\(props\.vaultId, state\(\)\)/);
	assert.match(source, /props\.t\("retry"\)/);
});

test('Archive view blocks autosave and mutations until the archive is read successfully', async () => {
	const source = await readFile(new URL('../src/pages/canvas/ui/archive-view/index.tsx', import.meta.url), 'utf8');
	const persistState = source.slice(source.indexOf('const persistState'), source.indexOf('const retryRead'));
	assert.ok(persistState.indexOf('if (readFailed()) return;') < persistState.indexOf('saveArchiveState('));
	assert.match(source, /const retryRead = \(\): void => \{[\s\S]*?readArchiveState\(props\.vaultId\)/);
	assert.match(source, /onClick=\{retryRead\}/);
	assert.match(source, /const putItemIn = .*=> \{\s*if \(props\.mode !== "edit" \|\| readFailed\(\)\) return;/);
	assert.match(source, /const createNote = async .*=> \{\s*if \(props\.mode !== "edit" \|\| readFailed\(\)\) return;/);
	assert.match(source, /readFailed\(\) \|\| !folderName\(\)\.trim\(\)/);
});
