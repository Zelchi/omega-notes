import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useNoteDeletion } from '../src/features/delete-note/model/controller.ts';
import { note, deferred, settle } from './helpers.mjs';

const setup = (initial, overrides = {}) => {
    let api, dispose;
    createRoot(stop => {
        dispose = stop;
        const [notes, setNotes] = createSignal([initial]), [vaultId, setVaultId] = createSignal('vault-a');
        let removed = [], deleted = [];
        const state = useNoteDeletion({ notes, vaultId, blocked: () => false, beforeDelete: async () => true,
            remove: async current => { removed.push(current.id); setNotes(list => list.filter(item => item.id !== current.id)); },
            onDeleted: id => deleted.push(id), ...overrides });
        api = { state, notes, setNotes, setVaultId, removed, deleted };
    });
    return { ...api, dispose };
};
for (const text of ['', '  \n \t']) test('empty content is deleted without confirmation: ' + JSON.stringify(text), async t => {
    const fixture = setup(note('a', text)); t.after(fixture.dispose);
    await fixture.state.request(fixture.notes()[0]);
    assert.deepEqual(fixture.removed, ['a']); assert.equal(fixture.state.target(), undefined);
});
for (const media of [[], [{ type: 'image', id: 'image' }]]) {
    test('text/media requires confirmation: ' + (media[0]?.type ?? 'text'), async t => {
        const f = setup(note('a', media.length ? '' : 'content', media)); t.after(f.dispose);
        await f.state.request(f.notes()[0]); assert.equal(f.removed.length, 0); assert.equal(f.state.target()?.id, 'a');
        await f.state.confirm(); assert.deepEqual(f.removed, ['a']);
    });
}
test('cancel leaves the note intact', async t => {
    const f = setup(note('a', 'text')); t.after(f.dispose);
    await f.state.request(f.notes()[0]); f.state.cancel(); await f.state.confirm();
    assert.equal(f.state.target(), undefined); assert.equal(f.removed.length, 0);
});
test('closing hides the confirmation and reopening restores it', async t => {
    const f = setup(note('a', 'text')); t.after(f.dispose);
    await f.state.request(f.notes()[0]); f.state.close();
    assert.equal(f.state.open(), false); assert.equal(f.state.target()?.id, 'a');
    await f.state.request(f.notes()[0]); assert.equal(f.state.open(), true);
    await f.state.confirm(); assert.deepEqual(f.removed, ['a']);
});
test('content added while saving requires confirmation', async t => {
    const save = deferred(), f = setup(note('a'), { beforeDelete: () => save.promise }); t.after(f.dispose);
    const request = f.state.request(f.notes()[0]); f.setNotes([note('a', 'new content')]); save.resolve(true); await request;
    assert.equal(f.removed.length, 0); assert.equal(f.state.target()?.id, 'a');
});
test('vault changes abort pending deletion', async t => {
    const save = deferred(), f = setup(note('a'), { beforeDelete: () => save.promise }); t.after(f.dispose);
    const request = f.state.request(f.notes()[0]); f.setVaultId('vault-b'); save.resolve(true); await request;
    assert.equal(f.removed.length, 0); assert.equal(f.state.pending(), false);
});
test('disposed controller cannot delete notes', async () => {
    const f = setup(note('a')); f.dispose(); await f.state.request(f.notes()[0]); assert.equal(f.removed.length, 0);
});
test('double confirmation only deletes once', async t => {
    const save = deferred(), f = setup(note('a', 'text'), { beforeDelete: () => save.promise }); t.after(f.dispose);
    await f.state.request(f.notes()[0]); const first = f.state.confirm(); await f.state.confirm(); save.resolve(true); await first;
    assert.deepEqual(f.removed, ['a']); assert.deepEqual(f.deleted, ['a']);
});
test('failed removal keeps the confirmation open for retry', async t => {
    t.mock.method(console, 'error', () => {});
    const f = setup(note('a', 'text'), { remove: async () => {} }); t.after(f.dispose);
    await f.state.request(f.notes()[0]); await f.state.confirm(); assert.equal(f.state.error(), true); assert.equal(f.state.target()?.id, 'a');
});
test('target is cleared if removed elsewhere', async t => {
    const f = setup(note('a', 'text')); t.after(f.dispose);
    await f.state.request(f.notes()[0]); f.setNotes([]); await settle(); assert.equal(f.state.target(), undefined);
});
test('save failure prevents deletion and reports the error', async t => {
    t.mock.method(console, 'error', () => {});
    const f = setup(note('a'), { beforeDelete: async () => false }); t.after(f.dispose);
    await f.state.request(f.notes()[0]); assert.equal(f.removed.length, 0); assert.equal(f.state.error(), true);
});
test('a new blocker during save prevents deletion', async t => {
    const save = deferred(); let blocked = false;
    const f = setup(note('a'), { beforeDelete: () => save.promise, blocked: () => blocked }); t.after(f.dispose);
    const request = f.state.request(f.notes()[0]); blocked = true; save.resolve(true); await request;
    assert.equal(f.removed.length, 0); assert.equal(f.state.pending(), false);
});
test('disposing during save prevents deletion and navigation', async () => {
    const save = deferred(), f = setup(note('a'), { beforeDelete: () => save.promise });
    const request = f.state.request(f.notes()[0]); f.dispose(); save.resolve(true); await request;
    assert.equal(f.removed.length, 0); assert.equal(f.deleted.length, 0);
});
