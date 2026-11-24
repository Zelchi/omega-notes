import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTextFormatting } from '../src/pages/notes/ui/note-text-node/text-formatting.ts';

test('text formatting returns the transformed document and selection range', () => {
	assert.deepEqual(
		prepareTextFormatting('hello', { start: 0, end: 5 }, 'bold'),
		{ text: '**hello**', selection: { start: 2, end: 7 } },
	);
});

test('table insertion at a collapsed table boundary keeps the new table separate', () => {
	const source = 'before\n| existing |';
	const result = prepareTextFormatting(source, { start: 7, end: 7 }, 'table', {
		atTableBoundary: true,
		tableColumnLabel: 'Column',
	});
	assert.match(result.text, /^before\n\| Column 1 \| Column 2 \| Column 3 \|\n\| --- \| --- \| --- \|/);
	assert.ok(result.text.endsWith('| existing |'));
	assert.equal(result.selection.start, 9);
	assert.equal(result.selection.end, 17);
});

test('table-boundary separation is not inserted for an existing text selection', () => {
	const result = prepareTextFormatting('hello', { start: 0, end: 5 }, 'italic', { atTableBoundary: true });
	assert.deepEqual(result, { text: '*hello*', selection: { start: 1, end: 6 } });
});
