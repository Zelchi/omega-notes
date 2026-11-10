import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFormattedBlocks, parseFormattedText } from '../src/shared/lib/formatted-text.ts';
import { layoutFormattedText } from '../src/pages/notes/lib/formatted-text-layout.ts';

const measureRun = run => run.text.length * 10;
const listLayout = (text, alignment, elements = []) => layoutFormattedText({
	text, x: 0, y: 0, width: 200, lineHeight: 20, elements, imageMargin: 0,
	measureRun, displayText: value => value, alignment,
});

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

test('bullet and numbered list markers follow right-aligned text and reserve room for the marker', () => {
	for (const text of ['- item', '7. item']) {
		const fragment = listLayout(text, 'right').fragments[0];
		const markerWidth = measureRun({ text: text.startsWith('-') ? '• ' : '7. ' });
		assert.equal(fragment.format.markerSide, 'right');
		assert.equal(fragment.left, 0);
		assert.equal(fragment.width, 200 - markerWidth);
	}
});

test('centered list markers stay adjacent to the centered text', () => {
	for (const text of ['- item', '7. item']) {
		const fragment = listLayout(text, 'center').fragments[0];
		const markerWidth = measureRun({ text: text.startsWith('-') ? '• ' : '7. ' });
		const textWidth = measureRun({ text: 'item' });
		assert.equal(fragment.format.markerSide, 'left');
		assert.equal(fragment.format.markerOffset, (200 - markerWidth - textWidth) / 2);
	}
});

test('right-aligned list markers stay clear of wrapped image boundaries', () => {
	const fragment = listLayout('- item', 'right', [{ x: 150, y: 0, width: 40, height: 40 }]).fragments[0];
	assert.equal(fragment.left + fragment.width + measureRun({ text: '• ' }), 150);
});

test('right-aligned list waits below an image when its remaining space cannot fit the marker', () => {
	const fragment = listLayout('- item', 'right', [{ x: 0, y: 0, width: 195, height: 40 }]).fragments[0];
	assert.equal(fragment.top, 40);
});
