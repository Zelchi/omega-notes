import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useNotes } from '../src/entities/note/model/notes-library.ts';
import { note, noteSummary, deferred, settle } from './helpers.mjs';

const setup = async (t, onSave) => {
    const initial = [note('a'), note('b')], writes = [];
    const previous = globalThis.window;
    globalThis.window = { __TAURI_INTERNALS__: { transformCallback: () => 1, unregisterCallback: () => {}, invoke: async (command, args) => {
        if (command === 'list_notes') return { notes: initial, issues: [], referenceTitles: {} };
        if (command === 'stream_note_summaries') {
            for (const value of initial) args.onItem.onmessage({ event: 'item', data: noteSummary(value) });
            args.onItem.onmessage({ event: 'complete', data: { issues: [], referenceTitles: {} } });
            return;
        }
        if (command === 'get_note') return initial.find(value => value.id === args.noteId);
        if (command === 'save_note') {
            writes.push({ id: args.noteId, text: args.document.elements[0].text });
            if (onSave) await onSave(args, writes.length);
            return { note: { ...note(args.noteId), title: args.noteTitle, document: args.document }, cleanupIssues: [] };
        }
        throw Error('Unexpected command: ' + command);
    } } };
    let library, setVault;
    createRoot(dispose => {
        t.after(() => { dispose(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
        const [vault, updateVault] = createSignal('vault-a'); setVault = updateVault;
        library = useNotes(vault);
    });
    for (let attempt = 0; attempt < 50 && (!library.hasLoadedVault() || library.notes().length !== initial.length); attempt++) await settle();
    assert.equal(library.hasLoadedVault(), true);
    assert.equal(library.notes().length, initial.length);
    await library.loadNote('a');
    const edit = (id, text) => library.updateDocument(id, note(id, text).document);
    return { library, writes, edit, setVault };
};
test('autosave coalesces edits and flush waits for persistence', async t => {
    const f = await setup(t); f.edit('a', 'first'); f.edit('a', 'latest');
    assert.equal(await f.library.flushSave(), true);
    assert.deepEqual(f.writes, [{ id: 'a', text: 'latest' }]);
});
test('failed old save cannot overwrite a newer queued save', async t => {
    const first = deferred(), f = await setup(t, (_args, count) => count === 1 ? first.promise : undefined);
    void first.promise.catch(() => undefined);
    const debounce = () => new Promise(resolve => setTimeout(resolve, 510));
    f.edit('a', 'old'); await debounce(); await settle();
    f.edit('a', 'new'); await debounce(); await settle();
    first.reject(Error('simulated write failure')); await settle();
    assert.equal(await f.library.flushSave(), true);
    assert.deepEqual(f.writes.map(write => write.text), ['old', 'new']);
});
test('flush skips a stale snapshot when another note changes during persistence', async t => {
    const first = deferred(), f = await setup(t, (_args, count) => count === 1 ? first.promise : undefined);
    await f.library.loadNote('b');
    f.edit('a', 'a1'); f.edit('b', 'b1'); const flush = f.library.flushSave(); await settle();
    f.edit('b', 'b2'); first.resolve(); assert.equal(await flush, true);
    assert.deepEqual(f.writes, [{ id: 'a', text: 'a1' }, { id: 'b', text: 'b2' }]);
});
test('failed latest save remains retryable', async t => {
    t.mock.method(console, 'error', () => {});
    const f = await setup(t, (_args, count) => { if (count === 1) throw Error('simulated failure'); });
    f.edit('a', 'latest'); assert.equal(await f.library.flushSave(), false); assert.equal(f.library.saveError(), true);
    assert.equal(await f.library.flushSave(), true); assert.equal(f.library.saveError(), false);
    assert.deepEqual(f.writes.map(write => write.text), ['latest', 'latest']);
});
test('unselecting a vault clears its loaded state', async t => {
    const f = await setup(t); assert.equal(f.library.hasLoadedVault(), true);
    f.setVault(undefined); await settle(); assert.equal(f.library.hasLoadedVault(), false); assert.deepEqual(f.library.notes(), []);
});
test('concurrent flush calls share the same operation', async t => {
    const save = deferred(), f = await setup(t, () => save.promise);
    f.edit('a', 'text'); const first = f.library.flushSave(), second = f.library.flushSave();
    assert.equal(first, second); await settle(); assert.equal(f.writes.length, 1);
    save.resolve(); assert.equal(await first, true);
});
test('flush also saves edits received while another write is in flight', async t => {
    const save = deferred(), f = await setup(t, (_args, count) => count === 1 ? save.promise : undefined);
    f.edit('a', 'first'); const flush = f.library.flushSave(); await settle();
    f.edit('a', 'latest'); save.resolve(); assert.equal(await flush, true);
    assert.deepEqual(f.writes.map(write => write.text), ['first', 'latest']);
});
