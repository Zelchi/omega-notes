import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfReaderResizeReporter, observePdfReaderResize } from '../src/features/manage-pdfs/model/resize-reporter.ts';

const createScheduler = () => {
	let nextId = 0;
	const tasks = new Map();
	const delays = [];
	return {
		delays,
		pending: () => tasks.size,
		runNext: () => {
			const [id, callback] = tasks.entries().next().value ?? [];
			if (callback) {
				tasks.delete(id);
				callback();
			}
		},
		scheduler: {
			setTimeout: (callback, delay) => {
				const id = nextId++;
				delays.push(delay);
				tasks.set(id, callback);
				return id;
			},
			clearTimeout: id => tasks.delete(id),
		},
	};
};

test('first observed size applies immediately and later sizes debounce to the newest value', () => {
	const timer = createScheduler();
	const sizes = [];
	const reporter = createPdfReaderResizeReporter(size => sizes.push(size), timer.scheduler);

	reporter.report({ width: 400, height: 500 });
	assert.deepEqual(sizes, [{ width: 400, height: 500 }]);

	reporter.report({ width: 410, height: 510 });
	reporter.report({ width: 420, height: 520 });
	assert.deepEqual(sizes, [{ width: 400, height: 500 }]);
	assert.equal(timer.pending(), 1);
	assert.deepEqual(timer.delays, [50, 50]);

	timer.runNext();
	assert.deepEqual(sizes, [
		{ width: 400, height: 500 },
		{ width: 420, height: 520 },
	]);
	assert.equal(timer.pending(), 0);
});

test('cancelling the resize reporter clears a pending size update', () => {
	const timer = createScheduler();
	const sizes = [];
	const reporter = createPdfReaderResizeReporter(size => sizes.push(size), timer.scheduler);

	reporter.report({ width: 400, height: 500 });
	reporter.report({ width: 420, height: 520 });
	reporter.cancel();
	reporter.cancel();

	assert.equal(timer.pending(), 0);
	assert.deepEqual(sizes, [{ width: 400, height: 500 }]);
});

test('ResizeObserver updates the reporter and cleanup disconnects and cancels pending size changes', () => {
	const timer = createScheduler();
	const target = {};
	const sizes = [];
	let observerCallback;
	let observedTarget;
	let disconnectCount = 0;
	const stop = observePdfReaderResize(target, size => sizes.push(size), {
		scheduler: timer.scheduler,
		createObserver: callback => {
			observerCallback = callback;
			return {
				observe: element => { observedTarget = element; },
				disconnect: () => { disconnectCount += 1; },
			};
		},
	});

	assert.equal(observedTarget, target);
	observerCallback(undefined);
	observerCallback({ width: 500, height: 700 });
	observerCallback({ width: 520, height: 710 });
	assert.deepEqual(sizes, [{ width: 500, height: 700 }]);
	assert.equal(timer.pending(), 1);

	stop();
	stop();
	timer.runNext();
	assert.equal(disconnectCount, 1);
	assert.equal(timer.pending(), 0);
	assert.deepEqual(sizes, [{ width: 500, height: 700 }]);
});

test('no ResizeObserver is created when the reader viewport is not mounted', () => {
	const sizes = [];
	const stop = observePdfReaderResize(undefined, size => sizes.push(size), {
		createObserver: () => { throw new Error('unexpected observer'); },
	});
	assert.doesNotThrow(stop);
	assert.deepEqual(sizes, []);
});
