import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleMarkdownTask } from '../src/pages/notes/ui/note-text-node/task-toggle.ts';

test('task toggle changes only the checkbox marker and reports the replacement range', () => {
	const result = toggleMarkdownTask('before\n  - [ ] task\n- [X] done', 1, true);
	assert.deepEqual(result, {
		text: 'before\n  - [x] task\n- [X] done',
		start: 11,
		end: 14,
		replacementLength: 3,
	});
});

test('task toggle accepts supported marker variants and preserves surrounding text', () => {
	assert.equal(toggleMarkdownTask('- [] empty', 0, true)?.text, '- [x] empty');
	assert.equal(toggleMarkdownTask('- [X] done', 0, false)?.text, '- [ ] done');
	assert.equal(toggleMarkdownTask('  -\t[ ] indented', 0, true)?.text, '  -\t[x] indented');
});

test('task toggle ignores non-task lines and out-of-range line numbers', () => {
	assert.equal(toggleMarkdownTask('plain text\n- [ ] task', 0, true), undefined);
	assert.equal(toggleMarkdownTask('- [ ] task', 1, true), undefined);
	assert.equal(toggleMarkdownTask('- [ ]task', 0, true), undefined);
});
