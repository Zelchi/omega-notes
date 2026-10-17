import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useCanvasHistory } from '../src/features/undo-canvas-edit/model/canvas-history.controller.ts';
import { deferred, note, settle } from './helpers.mjs';

const snapshot = (x = 42, layout = 'static') => ({ layout, positions: { a: { x, y: 80 } } });
const setup = (t, config = {}) => {
    const originalWindow = globalThis.window, originalElement = globalThis.Element;
    const events = new EventTarget(); globalThis.window = events; globalThis.Element = class {};
    let fixture, stop;
    createRoot(dispose => {
        stop = dispose;
        const [vaultId, setVault] = createSignal('vault-a');
        const [all, setAll] = createSignal({ 'vault-a': [note('a')], 'vault-b': [note('b')] });
        const [loading, setLoading] = createSignal(false);
        const loads = [], layouts = [], removed = [], restored = [];
        const notes = {
            loading, notes: () => all()[vaultId()] ?? [],
            listDeleted: () => { const id = vaultId(); loads.push(id); return config.listDeleted?.(id) ?? Promise.resolve([]); },
            remove: async current => {
                const id = vaultId(); await config.onRemove?.(id, current);
                removed.push([id, current.id]); setAll(previous => ({ ...previous, [id]: previous[id].filter(item => item.id !== current.id) }));
                return true;
            },
            restore: async noteId => {
                const id = vaultId(); await config.onRestore?.(id, noteId);
                const restoredNote = note(noteId); restored.push([id, noteId]);
                setAll(previous => ({ ...previous, [id]: [...(previous[id] ?? []), restoredNote] })); return restoredNote;
            },
        };
        const history = useCanvasHistory({ notes, vaultId, enabled: () => true, setLayout: value => layouts.push(value) });
        fixture = { history, vaultId, setVault, setLoading, notes, loads, layouts, removed, restored };
    });
    let disposed = false;
    const dispose = () => { if (!disposed) { disposed = true; stop(); } };
    t.after(() => {
        dispose();
        if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
        if (originalElement === undefined) delete globalThis.Element; else globalThis.Element = originalElement;
    });
    const shortcut = async (key = 'z') => {
        const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, ctrlKey: true });
        events.dispatchEvent(event); await settle();
    };
    return { ...fixture, shortcut, dispose };
};
test('old history completion cannot release the current vault loading state', async t => {
    const a = deferred(), b = deferred(), f = setup(t, { listDeleted: id => id === 'vault-a' ? a.promise : b.promise });
    assert.equal(f.history.pending(), true); f.setVault('vault-b'); assert.equal(f.history.pending(), true);
    a.resolve([]); await settle(); assert.equal(f.history.pending(), true);
    b.resolve([]); await settle(); assert.equal(f.history.pending(), false);
});
test('current history may finish before an older request', async t => {
    const a = deferred(), b = deferred(), f = setup(t, { listDeleted: id => id === 'vault-a' ? a.promise : b.promise });
    f.setVault('vault-b'); b.resolve([]); await settle(); assert.equal(f.history.pending(), false);
    a.resolve([]); await settle(); assert.equal(f.history.pending(), false);
    f.setVault('vault-a'); assert.equal(f.history.pending(), false);
});
test('returning to a vault while it still loads remains blocked', async t => {
    const a = deferred(), f = setup(t, { listDeleted: id => id === 'vault-a' ? a.promise : Promise.resolve([]) });
    f.setVault('vault-b'); await settle(); assert.equal(f.history.pending(), false);
    f.setVault('vault-a'); assert.equal(f.history.pending(), true); assert.equal(f.loads.filter(id => id === 'vault-a').length, 1);
    a.resolve([]); await settle(); assert.equal(f.history.pending(), false);
});
test('old request errors do not appear in the current vault', async t => {
    const a = deferred(), f = setup(t, { listDeleted: id => id === 'vault-a' ? a.promise : Promise.resolve([]) });
    f.setVault('vault-b'); await settle(); a.reject(Error('old failure')); await settle();
    assert.equal(f.history.error(), false); assert.equal(f.history.pending(), false);
});
test('failed history loads can be retried by returning to the vault', async t => {
    t.mock.method(console, 'error', () => {}); let requests = 0;
    const f = setup(t, { listDeleted: id => id === 'vault-a' && ++requests === 1 ? Promise.reject(Error('failure')) : Promise.resolve([]) });
    await settle(); assert.equal(f.history.error(), true);
    f.setVault('vault-b'); await settle(); f.setVault('vault-a'); await settle();
    assert.equal(f.history.error(), false); assert.equal(f.loads.filter(id => id === 'vault-a').length, 2);
});
for (const layout of ['static', 'dynamic']) test('delete inside note and undo restores its position: ' + layout, async t => {
    const f = setup(t); await settle();
    const unregister = f.history.register('vault-a', () => snapshot(42, layout)); unregister();
    await f.history.remove(f.notes.notes()[0]); assert.equal(f.notes.notes().length, 0);
    await f.shortcut(); assert.deepEqual(f.restored, [['vault-a', 'a']]);
    assert.deepEqual(f.history.restoration(), { ...snapshot(42, layout), vaultId: 'vault-a', revision: 1 });
    assert.deepEqual(f.layouts, [layout]);
    await f.shortcut('y'); assert.equal(f.notes.notes().length, 0);
    assert.deepEqual(f.history.restoration().positions, {});
    await f.shortcut(); assert.equal(f.history.restoration().positions.a.x, 42);
});
test('snapshot survives switching vaults before deleting inside a note', async t => {
    const f = setup(t); await settle(); f.history.register('vault-a', () => snapshot(42))();
    f.setVault('vault-b'); await settle(); f.history.register('vault-b', () => ({ layout: 'dynamic', positions: { b: { x: 999, y: 20 } } }))();
    f.setVault('vault-a'); await settle(); await f.history.remove(f.notes.notes()[0]); await f.shortcut();
    assert.deepEqual(f.history.restoration().positions, snapshot().positions);
});
test('a stale undo cannot restore positions into another vault', async t => {
    const restore = deferred(), f = setup(t, { onRestore: () => restore.promise }); await settle();
    f.history.register('vault-a', () => snapshot())(); await f.history.remove(f.notes.notes()[0]);
    const undo = f.shortcut(); await settle(); f.setVault('vault-b'); await settle();
    restore.resolve(); await undo; await settle(); assert.equal(f.history.restoration(), undefined); assert.equal(f.layouts.length, 0);
});
test('old loads cannot clear a mutation that is in progress', async t => {
    const a = deferred(), mutation = deferred(), f = setup(t, {
        listDeleted: id => id === 'vault-a' ? a.promise : Promise.resolve([]), onRemove: () => mutation.promise,
    });
    f.setVault('vault-b'); await settle(); const removal = f.history.remove(f.notes.notes()[0]);
    a.resolve([]); await settle(); assert.equal(f.history.pending(), true);
    mutation.resolve(); await removal; assert.equal(f.history.pending(), false);
});
test('responses after dispose do not report errors or register shortcuts', async t => {
    const load = deferred(), f = setup(t, { listDeleted: () => load.promise }); f.dispose();
    load.reject(Error('after dispose')); await settle(); assert.equal(f.history.error(), false);
    await f.shortcut(); assert.equal(f.restored.length, 0);
});
test('a final move from an unmounting canvas stays in its original vault', async t => {
    const f = setup(t); await settle(); f.setVault('vault-b'); await settle();
    f.history.moved('vault-a', snapshot(10), snapshot(20));
    await f.shortcut(); assert.equal(f.history.restoration(), undefined);
    f.setVault('vault-a'); await settle(); await f.shortcut();
    assert.deepEqual(f.history.restoration(), { ...snapshot(10), vaultId: 'vault-a', revision: 1 });
});
