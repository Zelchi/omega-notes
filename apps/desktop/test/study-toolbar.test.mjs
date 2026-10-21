import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('study methods are directly available in the main reading toolbar', async () => {
	const source = await readFile(new URL('../src/features/study-notes/ui/study-toolbar.tsx', import.meta.url), 'utf8');
	const start = source.lastIndexOf('<div class={toolbarStyles.row}');
	const toolbar = source.slice(start, source.indexOf('<Tooltip', start));
	for (const kind of ['flashcards', 'quiz', 'written', 'cloze', 'correction']) {
		assert.ok(toolbar.includes(`props.study.show("${kind}")`), `${kind} should be in the main toolbar`);
	}
	assert.doesNotMatch(source, /studySubbar|studyMenu/);
});
