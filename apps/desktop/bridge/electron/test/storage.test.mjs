import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStorageSnapshot } from '../storage.mjs';
import { applyStorageSnapshot } from '../../../frontend/src/shared/lib/storage-import.ts';

test('settings import preserves archive organization and rolls back a failed write', () => {
    const archive = JSON.stringify({ folders: [{ id:'folder', name:'Math' }], noteFolders: { note:'folder' }, itemOrder:{} });
    const snapshot = validateStorageSnapshot({ 'omega-notes.archive.vault': archive, 'omega-notes.settings.theme': 'light' });
    const values = new Map([['omega-notes.settings.theme','dark'], ['unrelated','kept']]);
    let fail = true;
    const storage = {
        get length() { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.get(key) ?? null,
        removeItem: key => values.delete(key),
        setItem(key, value) { if (key === 'omega-notes.settings.theme' && fail) { fail = false; throw Error('Quota exceeded'); } values.set(key,value); },
    };
    assert.throws(() => applyStorageSnapshot(storage,snapshot), /Quota exceeded/);
    assert.deepEqual([...values], [['unrelated','kept'], ['omega-notes.settings.theme','dark']]);
    applyStorageSnapshot(storage,snapshot);
    assert.equal(JSON.parse(values.get('omega-notes.archive.vault')).noteFolders.note,'folder');
    assert.equal(values.get('omega-notes.settings.theme'),'light');
    assert.equal(values.get('unrelated'),'kept');
    assert.throws(() => validateStorageSnapshot({ secret:'value' }), /Invalid/);
    assert.throws(() => validateStorageSnapshot({ 'omega-notes.settings.theme':null }), /Invalid/);
});
