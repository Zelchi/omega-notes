import assert from 'node:assert/strict';
import test from 'node:test';
import { arePdfPageElementsReady } from '../src/features/manage-pdfs/model/page-elements.ts';

const nodes = () => ({ canvas: {}, textLayer: {} });

test('single-page rendering waits for both the canvas and text layer', () => {
	const elements = new Map();
	assert.equal(arePdfPageElementsReady([1], elements), false);

	elements.set(1, { canvas: {} });
	assert.equal(arePdfPageElementsReady([1], elements), false);

	elements.set(1, nodes());
	assert.equal(arePdfPageElementsReady([1], elements), true);
});

test('spread rendering waits for every visible page and ignores offscreen pages', () => {
	const elements = new Map([[1, nodes()], [3, nodes()]]);
	assert.equal(arePdfPageElementsReady([1, 2], elements), false);

	elements.set(2, { textLayer: {} });
	assert.equal(arePdfPageElementsReady([1, 2], elements), false);

	elements.set(2, nodes());
	assert.equal(arePdfPageElementsReady([1, 2], elements), true);
});

test('an empty visible-page set is ready', () => {
	assert.equal(arePdfPageElementsReady([], new Map()), true);
});
