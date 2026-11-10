import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFormattedBlocks, parseFormattedText } from '../src/shared/lib/formatted-text.ts';

test('formatted rendering groups consecutive list items after headings', () => {
	const groups = groupFormattedBlocks(parseFormattedText('### MID\n- Refeitório\n- Enfermaria\n- Área de Lazer'));

	assert.equal(groups.length, 2);
	assert.equal(groups[0].type, 'block');
	assert.equal(groups[0].block.kind, 'heading');
	assert.equal(groups[1].type, 'list');
	assert.equal(groups[1].ordered, false);
	assert.deepEqual(groups[1].blocks.map(block => block.text), ['Refeitório', 'Enfermaria', 'Área de Lazer']);
});

test('formatted rendering starts new lists when type, indentation, or numbering changes', () => {
	const groups = groupFormattedBlocks(parseFormattedText([
		'# TOP',
		'3. First',
		'4. Second',
		'9. Restart',
		'- Bullet',
		'  - Indented one',
		'  - Indented two',
	].join('\n')));

	assert.deepEqual(groups.map(group => group.type === 'list'
		? { type: group.type, ordered: group.ordered, indent: group.indent, start: group.start, items: group.blocks.map(block => block.text) }
		: { type: group.type, kind: group.block.kind, text: group.block.text }), [
		{ type: 'block', kind: 'heading', text: 'TOP' },
		{ type: 'list', ordered: true, indent: '', start: 3, items: ['First', 'Second'] },
		{ type: 'list', ordered: true, indent: '', start: 9, items: ['Restart'] },
		{ type: 'list', ordered: false, indent: '', start: undefined, items: ['Bullet'] },
		{ type: 'list', ordered: false, indent: '  ', start: undefined, items: ['Indented one', 'Indented two'] },
	]);
});
