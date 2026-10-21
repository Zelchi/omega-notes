import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useNotes } from '../src/entities/note/model/notes-library.ts';
import { note, noteSummary, deferred, settle } from './helpers.mjs';

const setup = async t => {
    const keys = ['window', 'document', 'setInterval', 'clearInterval'];
    const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const disk = new Map([['note-1', note('note-1', 'original')]]), intervals = new Set();
    let revision = 0, readGate, captured, copies = 0, library, setVault;
    const snapshot = () => structuredClone({ notes: [...disk.values()], issues: [], referenceTitles: {} });
    const invoke = async (command, args) => {
        if (command === 'stream_note_summaries') {
            let value = snapshot();
            if (args.external && readGate) { const gate = readGate; readGate = undefined; captured = value; value = await gate.promise; }
            for (const item of value.notes) args.onItem.onmessage({ event: 'item', data: noteSummary(item) });
            args.onItem.onmessage({ event: 'complete', data: { issues: value.issues, referenceTitles: value.referenceTitles } });
            return;
        }
        if (command === 'notes_changes') {
            return { fullResync: true, changeToken: String(revision), changedIds: [], removedIds: [], notes: [], issues: [], referenceTitles: {} };
        }
        if (command === 'acknowledge_note_changes') {
            return;
        }
        if (command === 'get_note') {
            const value = disk.get(args.noteId);
            if (!value) throw Error('NOTE_NOT_FOUND');
            return structuredClone(value);
        }
        if (command === 'create_note') {
            const value = { ...note('copy-' + ++copies), title: args.noteTitle };
            disk.set(value.id, value); revision++; return structuredClone(value);
        }
        if (command === 'save_note') {
            const current = disk.get(args.noteId);
            if (!current || current.title !== args.expectedNote.title || JSON.stringify(current.document) !== JSON.stringify(args.expectedNote.document)) throw 'NOTE_EXTERNAL_CONFLICT';
            const saved = { ...current, title: args.noteTitle, document: structuredClone(args.document), updatedAt: ++revision };
            disk.set(saved.id, saved); return structuredClone({ note: saved, cleanupIssues: [] });
        }
        throw Error('Unexpected command ' + command);
    };
    const values = [
        { __TAURI_INTERNALS__: { transformCallback: () => 1, unregisterCallback: () => {}, invoke }, addEventListener() {}, removeEventListener() {} },
        { hidden: false }, callback => { intervals.add(callback); return callback; }, callback => intervals.delete(callback),
    ];
    keys.forEach((key, index) => Object.defineProperty(globalThis, key, { configurable: true, value: values[index] }));
    createRoot(dispose => {
        t.after(() => { dispose(); keys.forEach((key, index) => { if (originals[index]) Object.defineProperty(globalThis, key, originals[index]); else delete globalThis[key]; }); });
        const [vault, update] = createSignal('vault-a'); setVault = update;
        library = useNotes(vault, () => true);
    });
    const tick = async () => { for (const callback of [...intervals]) callback(); await settle(); };
    const waitFor = async (predicate, refresh = false) => {
        for (let attempt = 0; attempt < 50; attempt++) {
            if (predicate()) return;
            if (refresh) await tick();
            await settle();
        }
        throw new Error('Timed out waiting for note library state');
    };
    await waitFor(() => library.hasLoadedVault() && library.notes().some(value => value.id === 'note-1'));
    await tick(); await tick();
    await library.loadNote('note-1');
    return { library, disk, tick, setVault,
        external: value => { disk.set(value.id, value); revision++; }, touch: () => { revision++; },
        edit: text => library.updateDocument('note-1', note('note-1', text).document),
        holdRead: () => { readGate = deferred(); return readGate; }, readSnapshot: () => captured, waitFor };
};

test('a read started during editing cannot reapply a document after its local save', async t => {
    const f = await setup(t); f.touch(); f.edit('local edit');
    const gate = f.holdRead(); await f.waitFor(() => Boolean(f.readSnapshot()), true);
    assert.equal(await f.library.flushSave(), true);
    gate.resolve(f.readSnapshot()); await settle();
    assert.equal((await f.library.loadNote('note-1')).document.elements[0].text, 'local edit');
    assert.deepEqual(f.library.conflicts(), []);
});

test('external conflicts preserve the draft and allow keeping it as a separate note', async t => {
    const f = await setup(t); f.external(note('note-1', 'external edit')); f.edit('local edit');
    assert.equal(await f.library.flushSave(), false); assert.deepEqual(f.library.conflicts(), ['note-1']);
    assert.equal(f.disk.get('note-1').document.elements[0].text, 'external edit');
    await f.library.resolveConflict('note-1', true, '(local copy)');
    assert.deepEqual(f.library.conflicts(), []);
    assert.equal(f.library.loadedNotes().find(value => value.id === 'note-1').document.elements[0].text, 'external edit');
    assert.equal(f.library.loadedNotes().find(value => value.id === 'copy-1').document.elements[0].text, 'local edit');
    assert.equal(await f.library.flushSave(), true);
});

test('loading the file version discards queued drafts without writing them back', async t => {
    const f = await setup(t); f.external(note('note-1', 'external edit')); f.edit('discarded draft');
    assert.equal(await f.library.flushSave(), false);
    await f.library.resolveConflict('note-1', false, '(local copy)');
    assert.equal(await f.library.flushSave(), true);
    assert.equal((await f.library.loadNote('note-1')).document.elements[0].text, 'external edit');
    assert.equal(f.disk.get('note-1').document.elements[0].text, 'external edit'); assert.equal(f.disk.size, 1);
});

test('external additions and deletions update clean notes after a stable revision', async t => {
    const f = await setup(t); f.disk.delete('note-1'); f.external(note('note-2', 'new external note'));
    await f.waitFor(() => f.library.notes().map(value => value.id).join(',') === 'note-2', true);
});

test('returning to a vault reads files instead of reusing its old cache', async t => {
    const f = await setup(t); f.setVault('vault-b'); await settle();
    await f.waitFor(() => !f.library.loading() && f.library.hasLoadedVault());
    f.external(note('note-1', 'updated while away')); f.setVault('vault-a'); await settle();
    await f.waitFor(() => f.library.hasLoadedVault() && f.library.notes().some(value => value.id === 'note-1'));
    assert.equal((await f.library.loadNote('note-1')).document.elements[0].text, 'updated while away');
});

test('a local copy remains visible if the draft changes during conflict resolution', async t => {
    const f = await setup(t); f.external(note('note-1', 'external edit')); f.edit('first draft');
    assert.equal(await f.library.flushSave(), false);
    const gate = f.holdRead();
    const resolving = f.library.resolveConflict('note-1', true, '(local copy)');
    await settle(); f.edit('newer draft');
    gate.resolve(f.readSnapshot()); await resolving;
    assert.deepEqual(f.library.conflicts(), ['note-1']);
    assert.equal(f.library.loadedNotes().find(value => value.id === 'note-1').document.elements[0].text, 'newer draft');
    assert.equal(f.library.loadedNotes().find(value => value.id === 'copy-1').document.elements[0].text, 'first draft');
    assert.equal(f.disk.get('note-1').document.elements[0].text, 'external edit');
});
