import test from 'node:test';
import assert from 'node:assert/strict';
import { readGraphState, saveGraphState } from '../src/pages/canvas/api/graph.repository.ts';
import { ForceLayout } from '../src/pages/canvas/lib/force-layout.ts';
import { CanvasSnapshotStore } from '../src/features/undo-canvas-edit/model/canvas-snapshot-store.ts';

const snapshot = (x, layout = 'static') => ({ layout, positions: { note: { x, y: 50 } } });
const storage = t => {
    const previousWindow = globalThis.window, previousStorage = globalThis.localStorage, data = new Map();
    globalThis.window = {};
    globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    t.after(() => {
        if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
        if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
    });
    return data;
};
test('canvas positions and camera are isolated by vault and layout', t => {
    const data = storage(t);
    for (const [vault, layout, x] of [['a', 'static', 1], ['b', 'static', 2], ['a', 'dynamic', 3], ['b', 'dynamic', 4]]) {
        saveGraphState(vault, { positions: { note: { x, y: 50 } }, view: { x, y: x, scale: 1 } }, layout);
    }
    assert.equal(data.size, 4);
    for (const [vault, layout, x] of [['a', 'static', 1], ['b', 'static', 2], ['a', 'dynamic', 3], ['b', 'dynamic', 4]]) {
        const saved = readGraphState(vault, layout); assert.equal(saved.positions.note.x, x); assert.equal(saved.view.x, x);
    }
});
test('zip ties persist only in their vault static canvas state', t => {
    storage(t);
    const zipTies = [{ id:'tie', members:[{ edgeKey:'["a","b"]', t:.25 }, { edgeKey:'["c","d"]', t:.75 }] }];
    saveGraphState('a', { positions:{}, zipTies });
    assert.deepEqual(readGraphState('a').zipTies, zipTies);
    assert.equal(readGraphState('b').zipTies, undefined);
    assert.equal(readGraphState('a', 'dynamic').zipTies, undefined);
});
test('invalid persisted zip ties are discarded', t => {
    const data = storage(t);
    data.set('omega-notes.graph.a.static', JSON.stringify({ positions:{}, zipTies:[
        { id:'bad-single-wire', members:[{ edgeKey:'a', t:.5 }] },
        { id:'bad-position', members:[{ edgeKey:'a', t:NaN }, { edgeKey:'b', t:.5 }] },
        { id:'good', members:[{ edgeKey:'a', t:.2 }, { edgeKey:'b', t:.8 }] },
    ] }));
    assert.deepEqual(readGraphState('a').zipTies, [{ id:'good', members:[{ edgeKey:'a', t:.2 }, { edgeKey:'b', t:.8 }] }]);
});
test('saving another vault does not remove existing positions', t => {
    storage(t); saveGraphState('a', snapshot(42)); saveGraphState('b', { positions: {} });
    assert.equal(readGraphState('a').positions.note.x, 42);
});
test('canvas without vault neither reads nor writes storage', t => {
    const data = storage(t); saveGraphState('', snapshot(42));
    assert.equal(data.size, 0); assert.deepEqual(readGraphState(''), { positions: {} });
});
test('global unscoped state is not attributed to an arbitrary vault', t => {
    const data = storage(t); data.set('omega-notes.graph.v1', JSON.stringify(snapshot(99)));
    assert.deepEqual(readGraphState('a'), { positions: {} });
});
test('invalid persisted positions are filtered', t => {
    const data = storage(t); saveGraphState('a', { positions: { good: { x: 1, y: 2 }, bad: { x: null, y: 'x' } } });
    assert.deepEqual(readGraphState('a').positions, { good: { x: 1, y: 2 } });
    data.set('omega-notes.graph.a.static', 'invalid'); assert.deepEqual(readGraphState('a'), { positions: {} });
});
test('snapshots survive unmount and do not call the reader afterward', () => {
    const store = new CanvasSnapshotStore(); let mounted = true;
    const unregister = store.register('a', () => { assert.equal(mounted, true); return snapshot(42); });
    unregister(); mounted = false; assert.deepEqual(store.read('a'), snapshot(42));
});
test('snapshots are copied before saving and returning', () => {
    const store = new CanvasSnapshotStore(), initial = snapshot(42); store.remember('a', initial);
    initial.positions.note.x = 999; const read = store.read('a'); read.positions.note.x = 777;
    assert.equal(store.read('a').positions.note.x, 42);
});
test('canvas history snapshots deeply copy zip ties', () => {
    const store = new CanvasSnapshotStore();
    const original = { layout:'static', positions:{}, zipTies:[{ id:'tie', members:[{ edgeKey:'a-b', t:.5 }, { edgeKey:'c-d', t:.6 }] }] };
    store.remember('a', original);
    original.zipTies[0].members[0].t = .9;
    const read = store.read('a');
    read.zipTies[0].members[1].edgeKey = 'changed';
    assert.deepEqual(store.read('a').zipTies, [{ id:'tie', members:[{ edgeKey:'a-b', t:.5 }, { edgeKey:'c-d', t:.6 }] }]);
});
test('unmount of one vault preserves another vault snapshot', () => {
    const store = new CanvasSnapshotStore(); const unregisterA = store.register('a', () => snapshot(1));
    store.register('b', () => snapshot(2, 'dynamic')); unregisterA();
    assert.deepEqual(store.read('a'), snapshot(1)); assert.deepEqual(store.read('b'), snapshot(2, 'dynamic'));
});
test('late cleanup cannot replace or unregister a newer canvas reader', () => {
    const store = new CanvasSnapshotStore(); const old = store.register('a', () => snapshot(1));
    const latest = store.register('a', () => snapshot(2, 'dynamic')); old();
    assert.deepEqual(store.read('a'), snapshot(2, 'dynamic')); latest(); assert.deepEqual(store.read('a'), snapshot(2, 'dynamic'));
});
test('clearing snapshots releases readers and stored positions', () => {
    const store = new CanvasSnapshotStore(); store.register('a', () => snapshot(42)); store.clear();
    assert.equal(store.read('a'), undefined);
});

test('restoring dynamic positions does not immediately move them again', () => {
    const layout = new ForceLayout({}); layout.setGraph(['a', 'b'], [{ source: 'a', target: 'b' }]);
    const positions = { a: { x: 50, y: 80 }, b: { x: 200, y: 150 } };
    layout.restorePositions(positions); for (let i = 0; i < 60; i++) layout.step();
    assert.deepEqual(layout.positions(), positions); assert.equal(layout.active, false);
    layout.wake(); assert.equal(layout.active, true);
});
