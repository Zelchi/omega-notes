import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getPdfAdjacentPreviewPages,
	getPdfPageNavigationTarget,
	getPdfPageSpreadPages,
	normalizePdfPageSpreadCursor,
	shouldUsePdfPageSpread,
} from '../src/features/manage-pdfs/model/page-spread.ts';

test('PDF double-page mode activates when two pages fit in the available height and width', () => {
	assert.equal(shouldUsePdfPageSpread(994, 700, 0.707, 8), false);
	assert.equal(shouldUsePdfPageSpread(996, 700, 0.707, 8), true);
	assert.equal(shouldUsePdfPageSpread(1400, 700, 0.707, 8, 1.1), false);
	assert.equal(shouldUsePdfPageSpread(600, 700, 0.707, 2), false);
	assert.equal(shouldUsePdfPageSpread(996, 700, 0.707, 2), true);
});

test('PDF spreads group pages into pairs starting at pages one and two', () => {
	assert.deepEqual(getPdfPageSpreadPages(1, 8, true), [1, 2]);
	assert.deepEqual(getPdfPageSpreadPages(2, 8, true), [1, 2]);
	assert.deepEqual(getPdfPageSpreadPages(3, 8, true), [3, 4]);
	assert.deepEqual(getPdfPageSpreadPages(4, 8, true), [3, 4]);
	assert.deepEqual(getPdfPageSpreadPages(5, 8, true), [5, 6]);
	assert.deepEqual(getPdfPageSpreadPages(8, 8, true), [7, 8]);
	assert.deepEqual(getPdfPageSpreadPages(3, 3, true), [3]);
	assert.deepEqual(getPdfPageSpreadPages(3, 8, false), [3]);
	assert.equal(normalizePdfPageSpreadCursor(1, 8, true), 2);
	assert.equal(normalizePdfPageSpreadCursor(2, 8, true), 2);
});

test('PDF double-page navigation advances and returns by spread', () => {
	assert.equal(getPdfPageNavigationTarget(1, 8, true, 1), 4);
	assert.equal(getPdfPageNavigationTarget(2, 8, true, 1), 4);
	assert.equal(getPdfPageNavigationTarget(4, 8, true, 1), 6);
	assert.equal(getPdfPageNavigationTarget(5, 8, true, -1), 4);
	assert.equal(getPdfPageNavigationTarget(3, 8, true, -1), 2);
	assert.equal(getPdfPageNavigationTarget(3, 8, false, 1), 4);
});

test('PDF preview selection includes the adjacent single page or spreads', () => {
	assert.deepEqual(getPdfAdjacentPreviewPages(1, [1, 2], 8, true), [3, 4]);
	assert.deepEqual(getPdfAdjacentPreviewPages(3, [3, 4], 8, true), [1, 2, 5, 6]);
	assert.deepEqual(getPdfAdjacentPreviewPages(7, [7, 8], 8, true), [5, 6]);
	assert.deepEqual(getPdfAdjacentPreviewPages(3, [3], 8, false), [4, 2]);
});
