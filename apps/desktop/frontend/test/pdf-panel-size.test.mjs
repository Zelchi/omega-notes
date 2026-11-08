import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPdfPanelWidth, getPdfPanelWidthLimits } from '../src/features/manage-pdfs/model/panel-size.ts';

test('PDF panel width stays continuous instead of snapping to Kanban session stops', () => {
	assert.deepEqual(getPdfPanelWidthLimits(1200), { minWidth: 420, maxWidth: 1176 });
	assert.equal(clampPdfPanelWidth(733, 1200), 733);
	assert.equal(clampPdfPanelWidth(100, 1200), 420);
	assert.equal(clampPdfPanelWidth(1300, 1200), 1176);
});

test('PDF panel limits shrink to fit narrow viewports', () => {
	assert.deepEqual(getPdfPanelWidthLimits(400), { minWidth: 376, maxWidth: 376 });
	assert.equal(clampPdfPanelWidth(733, 400), 376);
});
