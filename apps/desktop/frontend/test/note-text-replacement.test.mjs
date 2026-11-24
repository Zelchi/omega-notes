import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CHARACTER } from '../src/pages/notes/lib/editable-text-dom.ts';
import { prepareTextReplacement, remapSelectionForReplacement } from '../src/pages/notes/ui/note-text-node/text-replacement.ts';

test('replacement strips editor markers and returns the change for history and alignment', () => {
	assert.deepEqual(prepareTextReplacement(`ab${EMPTY_CHARACTER}cd`, `X${EMPTY_CHARACTER}Y`, { start: 1, end: 3 }, false), {
		text: 'aXYd', caret: 3, change: { start: 1, end: 3, length: 2 },
	});
	assert.deepEqual(prepareTextReplacement('abc', '😀', { start: 1, end: 2 }, false, 1), {
		text: 'a😀c', caret: 2, change: { start: 1, end: 2, length: 2 },
	});
});

test('insertion immediately before a table keeps the table on its own line', () => {
	const table = '| A |\n| --- |\n| x |';
	assert.deepEqual(prepareTextReplacement(table, 'hello', { start: 0, end: 0 }, true), {
		text: `hello\n${table}`, caret: 5, change: { start: 0, end: 0, length: 6 },
	});
	assert.equal(prepareTextReplacement(table, 'hello\n', { start: 0, end: 0 }, true).text, `hello\n${table}`);
	assert.equal(prepareTextReplacement(table, '', { start: 0, end: 0 }, true).text, table);
});

test('deleting a newline before a table keeps the caret outside the table', () => {
	const table = '| A |\n| --- |\n| x |';
	const result = prepareTextReplacement(`abc\n\n${table}`, '', { start: 4, end: 5 }, false);
	assert.equal(result.text, `abc\n${table}`);
	assert.equal(result.caret, 3);
	assert.deepEqual(result.change, { start: 4, end: 5, length: 0 });
});

test('asynchronous replacement remaps selection before, inside and after its range', () => {
	const range = { start: 4, end: 10 };
	assert.deepEqual(remapSelectionForReplacement({ start: 2, end: 4 }, range, 3), { start: 2, end: 4 });
	assert.deepEqual(remapSelectionForReplacement({ start: 5, end: 9 }, range, 3), { start: 5, end: 7 });
	assert.deepEqual(remapSelectionForReplacement({ start: 10, end: 12 }, range, 3), { start: 7, end: 9 });
	assert.deepEqual(remapSelectionForReplacement({ start: 3, end: 12 }, range, 8), { start: 3, end: 14 });
	assert.deepEqual(remapSelectionForReplacement({ start: 7, end: 7 }, range, 0), { start: 4, end: 4 });
});
