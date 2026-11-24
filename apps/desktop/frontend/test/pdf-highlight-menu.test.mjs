import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfHighlightMenu } from '../src/features/manage-pdfs/model/highlight-menu.ts';

const host = {
	scrollLeft: 40,
	scrollTop: 20,
	clientWidth: 300,
	clientHeight: 180,
};
const hostBounds = { left: 100, top: 50 };
const selection = {
	text: 'selected text',
	rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
};

test('new-selection menu retains its selection and stays within the visible host bounds', () => {
	assert.deepEqual(createPdfHighlightMenu({
		selection,
		page: 4,
		cursorX: 210,
		cursorY: 140,
		host,
		hostBounds,
	}), {
		text: 'selected text',
		selection,
		highlightId: undefined,
		page: 4,
		x: 124,
		y: 76,
		mode: 'actions',
	});
});

test('existing-highlight menu uses its larger bounds and does not retain a new selection', () => {
	assert.deepEqual(createPdfHighlightMenu({
		selection: undefined,
		existingHighlight: { id: 'mark-1', text: 'saved text' },
		page: 2,
		cursorX: 105,
		cursorY: 55,
		host,
		hostBounds,
	}), {
		text: 'saved text',
		selection: undefined,
		highlightId: 'mark-1',
		page: 2,
		x: 48,
		y: 28,
		mode: 'actions',
	});
});

test('a text selection over an existing highlight supplies the displayed text but edits that highlight', () => {
	assert.deepEqual(createPdfHighlightMenu({
		selection,
		existingHighlight: { id: 'mark-1', text: 'saved text' },
		page: 2,
		cursorX: 105,
		cursorY: 55,
		host,
		hostBounds,
	}), {
		text: 'selected text',
		selection: undefined,
		highlightId: 'mark-1',
		page: 2,
		x: 48,
		y: 28,
		mode: 'actions',
	});
});

test('no menu is created without a text selection or existing highlight', () => {
	assert.equal(createPdfHighlightMenu({
		selection: undefined,
		page: 1,
		cursorX: 150,
		cursorY: 120,
		host,
		hostBounds,
	}), undefined);
});
