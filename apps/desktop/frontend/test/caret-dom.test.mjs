import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CHARACTER } from '../src/pages/notes/lib/editable-text-dom.ts';
import { findTextPosition, getVisibleLength, stripEmptyCharacter } from '../src/pages/notes/ui/note-text-node/caret-dom.ts';

test('caret offsets ignore empty-character markers and skip editable table source', () => {
	const previousText = globalThis.Text;
	class TextStub { constructor(textContent) { this.textContent = textContent; } }
	globalThis.Text = TextStub;
	try {
		const first = new TextStub(`a${EMPTY_CHARACTER}b`);
		const table = new TextStub('table source');
		const last = new TextStub(`c${EMPTY_CHARACTER}`);
		const fragment = (start, node, isTable = false) => ({
			dataset: { start: String(start) },
			firstChild: node,
			hasAttribute: name => isTable && name === 'data-editable-table-source',
		});
		const root = { querySelectorAll: () => [fragment(0, first), fragment(2, table, true), fragment(2, last)] };
		assert.deepEqual(findTextPosition(root, 1), { node: first, offset: 1 });
		assert.deepEqual(findTextPosition(root, 2), { node: last, offset: 0 });
		assert.deepEqual(findTextPosition(root, 3), { node: last, offset: 1 });
		assert.equal(stripEmptyCharacter(first.textContent), 'ab');
		assert.equal(getVisibleLength(first.textContent), 2);
	} finally {
		globalThis.Text = previousText;
	}
});
