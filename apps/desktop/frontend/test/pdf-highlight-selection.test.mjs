import assert from 'node:assert/strict';
import test from 'node:test';
import { getPdfHighlightAt, getPdfSelectionData } from '../src/features/manage-pdfs/model/highlight-selection.ts';
import { maxPdfHighlightRects, maxPdfHighlightTextLength } from '../src/features/manage-pdfs/api/pdfs.repository.ts';

const bounds = { left: 100, top: 50, right: 300, bottom: 250, width: 200, height: 200 };
const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const makeSelection = (rects, text = ' chosen ', overrides = {}) => {
	const start = {}, end = {};
	const container = {
		contains: node => node === start || node === end,
		getBoundingClientRect: () => bounds,
	};
	const range = { startContainer: start, endContainer: end, getClientRects: () => rects };
	const selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range, toString: () => text, ...overrides };
	return { container, selection, range };
};

test('selection merges adjacent fragments, sorts lines and clamps them to the page', () => {
	const { container, selection } = makeSelection([
		rect(150, 100, 180, 110), rect(95, 70, 125, 80), rect(130, 70, 155, 80), rect(100, 50, 100, 60),
	]);
	assert.deepEqual(getPdfSelectionData(container, selection), {
		text: 'chosen',
		rects: [
			{ x: 0, y: 0.1, width: 0.275, height: 0.05 },
			{ x: 0.25, y: 0.25, width: 0.15, height: 0.05 },
		],
	});
});

test('selection rejects empty, oversized, cross-page and non-visible input', () => {
	const f = makeSelection([rect(110, 60, 120, 70)]);
	assert.equal(getPdfSelectionData(f.container, null), undefined);
	assert.equal(getPdfSelectionData(f.container, { ...f.selection, isCollapsed: true }), undefined);
	assert.equal(getPdfSelectionData(f.container, { ...f.selection, toString: () => ' ' }), undefined);
	assert.equal(getPdfSelectionData(f.container, { ...f.selection, toString: () => '😀'.repeat(maxPdfHighlightTextLength + 1) }), undefined);
	f.range.endContainer = {};
	assert.equal(getPdfSelectionData(f.container, f.selection), undefined);
	const outside = makeSelection([rect(400, 300, 410, 310)]);
	assert.equal(getPdfSelectionData(outside.container, outside.selection), undefined);
	const tooMany = makeSelection(Array.from({ length: maxPdfHighlightRects + 1 }, (_, i) => rect(110, i * 20, 120, i * 20 + 5)));
	assert.equal(getPdfSelectionData(tooMany.container, tooMany.selection), undefined);
});

test('highlight hit testing is page-specific and uses normalized coordinates', () => {
	const f = makeSelection([]);
	const highlight = { id: 'one', page: 2, rects: [{ x: 0.25, y: 0.25, width: 0.2, height: 0.1 }] };
	assert.equal(getPdfHighlightAt([highlight], 2, f.container, 160, 110), highlight);
	assert.equal(getPdfHighlightAt([highlight], 1, f.container, 160, 110), undefined);
	assert.equal(getPdfHighlightAt([highlight], 2, f.container, 110, 110), undefined);
});
