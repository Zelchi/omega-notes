import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldKeepPdfPanelMounted } from '../src/features/manage-pdfs/model/panel-presence.ts';

test('PDF panel stays mounted while its exit animation is present', () => {
	assert.equal(shouldKeepPdfPanelMounted(true, undefined), true);
});

test('PDF reader stays mounted after the panel closes while a document remains open', () => {
	assert.equal(shouldKeepPdfPanelMounted(false, 'pdf-1'), true);
});

test('PDF panel unmounts after closing when no document is open', () => {
	assert.equal(shouldKeepPdfPanelMounted(false, undefined), false);
});
