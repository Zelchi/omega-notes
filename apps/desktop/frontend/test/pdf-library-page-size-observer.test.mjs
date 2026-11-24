import assert from 'node:assert/strict';
import test from 'node:test';
import { observePdfLibraryPageSize } from '../src/features/manage-pdfs/model/library-page-size-observer.ts';

test('initial list height and later ResizeObserver notifications update the page size', () => {
	const list = { clientHeight: 172 };
	const sizes = [];
	let observeTarget;
	let notify;
	let disconnected = false;
	const stop = observePdfLibraryPageSize(list, size => sizes.push(size), callback => {
		notify = callback;
		return {
			observe: target => { observeTarget = target; },
			disconnect: () => { disconnected = true; },
		};
	});

	assert.deepEqual(sizes, [2]);
	assert.equal(observeTarget, list);

	list.clientHeight = 262;
	notify();
	assert.deepEqual(sizes, [2, 3]);

	stop();
	assert.equal(disconnected, true);
});
