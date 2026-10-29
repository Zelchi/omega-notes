import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createRoot } from 'solid-js';
import { deferred } from './helpers.mjs';

const state = globalThis.__windowControlsTest = {
    resizeHandler: undefined,
    resizeRegistered: false,
    queries: [],
    sizeQueries: [],
};
globalThis.window = { omegaDesktop: {} };

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === '../api/window.repository' && context.parentURL?.endsWith('/app/model/window-controls.controller.ts')) {
            return {
                url: `data:text/javascript,${encodeURIComponent(`
                    const state = globalThis.__windowControlsTest;
                    export const isWindowMaximized = () => { const query = deferred(); state.queries.push(query); return query.promise; };
                    export const getWindowAxisSizes = () => { const query = deferred(); state.sizeQueries.push(query); return query.promise; };
                    export const onWindowResized = async (handler) => { state.resizeRegistered = true; state.resizeHandler = handler; return () => {}; };
                    export const confirmCloseWithoutSaving = async () => false;
                    export const exitMainApp = async () => {};
                    export const hideMainWindow = async () => {};
                    export const isGnomeDesktop = async () => false;
                    export const minimizeWindow = async () => {};
                    export const onWindowCloseRequested = async () => () => {};
                    export const toggleWindowMaximize = async () => {};
                    function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
                `)}`,
                shortCircuit: true,
            };
        }
        return nextResolve(specifier, context);
    },
});

test('registers resize listener first and only applies the latest maximized and work-area query', async () => {
    const { useWindowControls } = await import('../src/app/model/window-controls.controller.ts');
    let controls;
    let dispose;
    createRoot((disposeRoot) => {
        dispose = disposeRoot;
        controls = useWindowControls(async () => true, (key) => key);
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.resizeRegistered, true);
    assert.equal(state.queries.length, 1);
    assert.equal(state.sizeQueries.length, 1);

    state.resizeHandler();
    assert.equal(state.queries.length, 2);
    assert.equal(state.sizeQueries.length, 2);
    state.queries[1].resolve(true);
    state.sizeQueries[1].resolve(null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controls.maximized(), true);
    assert.equal(controls.squareCorners(), true);

    state.queries[0].resolve(false);
    state.sizeQueries[0].resolve({ width: 800, height: 600, workWidth: 1920, workHeight: 1080 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controls.maximized(), true);
    assert.equal(controls.squareCorners(), true);
    dispose();
});

test('square corners follow maximized and Linux work-area dimensions with a 5% tolerance', async () => {
    const { useWindowControls } = await import('../src/app/model/window-controls.controller.ts');
    const cases = [
        ['maximized', true, { width: 800, height: 600, workWidth: 1920, workHeight: 1080 }, true],
        ['full width', false, { width: 1904, height: 600, workWidth: 1920, workHeight: 1080 }, true],
        ['full height', false, { width: 800, height: 1064, workWidth: 1920, workHeight: 1080 }, true],
        ['normal window', false, { width: 1200, height: 800, workWidth: 1920, workHeight: 1080 }, false],
        ['gap beyond tolerance', false, { width: 1823, height: 1025, workWidth: 1920, workHeight: 1080 }, false],
    ];

    for (const [name, isMaximized, sizes, expected] of cases) {
        state.resizeRegistered = false;
        state.queries = [];
        state.sizeQueries = [];
        let controls;
        let dispose;
        createRoot((disposeRoot) => {
            dispose = disposeRoot;
            controls = useWindowControls(async () => true, (key) => key);
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(state.resizeRegistered, true, `${name}: listener registered`);
        state.queries[0].resolve(isMaximized);
        state.sizeQueries[0].resolve(sizes);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(controls.maximized(), isMaximized, `${name}: maximized state`);
        assert.equal(controls.squareCorners(), expected, name);
        dispose();
    }
});
