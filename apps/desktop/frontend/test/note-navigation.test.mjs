import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useNoteNavigationController } from '../src/app/model/note-navigation.controller.ts';
import { deferred, settle } from './helpers.mjs';

test('changing vault during a note read discards the stale navigation', async t => {
    const load = deferred();
    let navigation, setVault;
    createRoot(dispose => {
        t.after(dispose);
        const [vaultId, changeVault] = createSignal('vault-a');
        setVault = changeVault;
        const [notes] = createSignal([{ id: 'note-1', title: 'Note' }]);
        const [loadedNotes] = createSignal([]);
        navigation = useNoteNavigationController({
            notes: {
                notes, loadedNotes, loading: () => false, flushSave: async () => true,
                loadNote: () => load.promise, releaseLoadedNotes: () => {},
            },
            activeVaultId: vaultId,
            centerCanvasOnLaunch: () => false,
            t: key => key,
        });
    });

    const opening = navigation.openNote({ id: 'note-1', title: 'Note' });
    await settle();
    assert.equal(navigation.navigating(), true);

    setVault('vault-b');
    load.resolve({ id: 'note-1', title: 'Note' });
    await opening;

    assert.equal(navigation.route(), 'canvas');
    assert.equal(navigation.selectedNote(), undefined);
});

test('note navigation overlaps saving with loading the selected document', async t => {
    const load = deferred();
    const save = deferred();
    let loadStarted = false;
    let saveStarted = false;
    let navigation;
    createRoot(dispose => {
        t.after(dispose);
        const [vaultId] = createSignal('vault-a');
        const [notes] = createSignal([{ id: 'note-1', title: 'Note' }]);
        const [loadedNotes] = createSignal([]);
        navigation = useNoteNavigationController({
            notes: {
                notes, loadedNotes, loading: () => false,
                flushSave: () => { saveStarted = true; return save.promise; },
                loadNote: () => { loadStarted = true; return load.promise; },
                releaseLoadedNotes: () => {},
            },
            activeVaultId: vaultId,
            centerCanvasOnLaunch: () => false,
            t: key => key,
        });
    });

    const opening = navigation.openNote({ id: 'note-1', title: 'Note' });
    await settle();
    assert.equal(loadStarted, true);
    assert.equal(saveStarted, true);
    assert.equal(navigation.route(), 'canvas');

    load.resolve({ id: 'note-1', title: 'Note' });
    await settle();
    assert.equal(navigation.route(), 'canvas');
    save.resolve(true);
    await opening;
    assert.equal(navigation.route(), 'note');
});
