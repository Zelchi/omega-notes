import assert from 'node:assert/strict';
import test from 'node:test';
import { expandDeletionRange, touchesProtectedTable } from '../src/pages/notes/ui/note-text-node/protected-table.ts';

const table = (start, end) => ({ start, end, format: { block: { kind: 'table' } } });

test('protected tables reject overlapping selections and unsafe joins', () => {
	const text = 'hello\n| A |\n| --- |\n| B |';
	const fragments = [table(6, text.length), { start: 0, end: 5 }];
	assert.equal(touchesProtectedTable(text, fragments, { start: 7, end: 8 }), true);
	assert.equal(touchesProtectedTable(text, fragments, { start: 0, end: 7 }), true);
	assert.equal(touchesProtectedTable(text, fragments, { start: 5, end: 6 }), true);
	assert.equal(touchesProtectedTable(text, fragments, { start: 5, end: 6 }, '\n'), false);
	assert.equal(touchesProtectedTable(text, fragments, { start: 0, end: 6 }), false);
	assert.equal(touchesProtectedTable(text, fragments, { start: 6, end: 6 }), false);
	assert.equal(touchesProtectedTable(text, fragments, { start: 0, end: 4 }), false);
});

test('word deletion expands from a caret without modifying an existing selection', () => {
	const text = 'one  😀word  last';
	assert.deepEqual(expandDeletionRange(text, 'deleteWordBackward', { start: 13, end: 13 }), { start: 3, end: 13 });
	assert.deepEqual(expandDeletionRange(text, 'deleteWordForward', { start: 3, end: 3 }), { start: 3, end: 13 });
	assert.deepEqual(expandDeletionRange(text, 'deleteWordBackward', { start: 1, end: 4 }), { start: 1, end: 4 });
	assert.deepEqual(expandDeletionRange(text, 'deleteByCut', { start: 3, end: 3 }), { start: 3, end: 3 });
});

test('line deletion finds boundaries including the following newline', () => {
	const text = 'first\nsecond\nthird';
	assert.deepEqual(expandDeletionRange(text, 'deleteSoftLineBackward', { start: 9, end: 9 }), { start: 6, end: 9 });
	assert.deepEqual(expandDeletionRange(text, 'deleteHardLineForward', { start: 9, end: 9 }), { start: 9, end: 13 });
	assert.deepEqual(expandDeletionRange(text, 'deleteHardLineForward', { start: 16, end: 16 }), { start: 16, end: 18 });
});
