import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeStudyItem } from '../src/entities/study/index.ts';

test('cloze decoding de-duplicates normalized answers while preserving punctuation', () => {
	const item = decodeStudyItem({
		question: 'Drink {{1}} with milk.',
		sources: ['source-note'],
		blanks: [[' Café  noir ', 'cafe noir', 'Cafe. noir']],
		explanation: 'A short explanation.',
	}, 'cloze', new Set(['source-note']));

	assert.deepEqual(item.blanks, [['Café  noir', 'Cafe. noir']]);
	assert.equal(item.answer, 'Drink Café  noir with milk.');
});
