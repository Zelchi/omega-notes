import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, onCleanup } from 'solid-js';
import { createLazyController } from '../src/app/model/lazy-controller.ts';

test('lazy controller shares concurrent loads, caches the result and owns its cleanup', async () => {
	let dispose;
	let loads = 0;
	let cleaned = false;
	const value = {};
	const lazy = createRoot(end => {
		dispose = end;
		return createLazyController(async () => {
			loads++;
			return () => {
				onCleanup(() => { cleaned = true; });
				return value;
			};
		});
	});
	const first = lazy.load();
	assert.equal(lazy.load(), first);
	assert.equal(await first, value);
	assert.equal(await lazy.load(), value);
	assert.equal(lazy.controller(), value);
	assert.equal(loads, 1);
	dispose();
	assert.equal(cleaned, true);
});

test('lazy controller retries a failed load', async () => {
	let dispose;
	let attempts = 0;
	const lazy = createRoot(end => {
		dispose = end;
		return createLazyController(async () => {
			if (++attempts === 1) throw Error('load failed');
			return () => 'ready';
		});
	});
	await assert.rejects(lazy.load(), /load failed/);
	assert.equal(await lazy.load(), 'ready');
	assert.equal(attempts, 2);
	dispose();
});

test('disposing while loading prevents controller creation', async () => {
	let dispose;
	let resolve;
	let created = false;
	const module = new Promise(done => { resolve = done; });
	const lazy = createRoot(end => {
		dispose = end;
		return createLazyController(() => module);
	});
	const pending = lazy.load();
	dispose();
	resolve(() => { created = true; return {}; });
	assert.equal(await pending, undefined);
	assert.equal(await lazy.load(), undefined);
	assert.equal(created, false);
});
