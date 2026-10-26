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

test('zip ties are managed from the edit toolbar instead of reading or zoom controls', async () => {
	const [readingToolbar, editToolbar, canvas, app] = await Promise.all([
		readFile(new URL('../src/features/study-notes/ui/study-toolbar.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/canvas/ui/graph-canvas/edit-toolbar.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/canvas/ui/graph-canvas/index.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8'),
	]);
	assert.match(editToolbar, /zipTie\(\)\.toggle/);
	assert.match(editToolbar, /name="link"/);
	assert.doesNotMatch(editToolbar, /zipTieDrawHint|props\.t/);
	assert.doesNotMatch(editToolbar, /zipTieCreate|name="check"/);
	assert.doesNotMatch(readingToolbar, /zipTieTool|zipTieCreate/);
	assert.doesNotMatch(canvas, /zipTieTool|zipTieCreate/);
	assert.match(app, /canvasEditToolbarVisible[\s\S]*mode\(\) === "edit"/);
});
