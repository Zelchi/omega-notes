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

test('zip ties use a Shift drag, preserve Shift-click selection, and move without a tool mode', async () => {
	const [controller, canvas, app, types] = await Promise.all([
		readFile(new URL('../src/pages/canvas/ui/graph-canvas/controller.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/canvas/ui/graph-canvas/index.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/canvas/ui/graph-canvas/types.ts', import.meta.url), 'utf8'),
	]);
	assert.doesNotMatch(controller, /zipTieMode|toggleZipTieMode|onZipTieToolbarChange/);
	assert.match(controller, /event\.shiftKey && !event\.ctrlKey && !event\.metaKey/);
	assert.match(controller, /beginZipTieStroke\(event, note\.id\)/);
	assert.match(controller, /if \(distance < 4\) setSelectedIds/);
	assert.match(controller, /props\.mode !== "edit" \|\| props\.busy \|\| zipTieDrag \|\| zipTieStroke\(\)/);
	assert.match(canvas, /class=\{props\.mode === "edit" \? styles\.zipTieInteractive : styles\.zipTiePassive\}/);
	assert.doesNotMatch(app, /CanvasEditToolbar|zipTieToolbar/);
	assert.doesNotMatch(types, /ZipTieToolbarState|onZipTieToolbarChange/);
});
