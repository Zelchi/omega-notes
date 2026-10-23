import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('media imports accept image formats including GIF and reject audio/video formats', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /imageExtensions = new Set\(\[.*"gif"/);
	assert.doesNotMatch(importer, /audioExtensions|videoExtensions/);
	assert.doesNotMatch(importer, /importNoteMedia|readMediaSource|getNoteMediaStreamUrl/);
});

test('failed files notify the editor without aborting successful files in the same batch', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /for \(const sourcePath of paths\)/);
	assert.match(importer, /catch \(error\) \{\s*console\.error\(error\);\s*onError\(\);\s*\}/);
	const editor = await source('../src/pages/notes/ui/note-canvas-editor/index.tsx');
	assert.match(editor, /role="alert" class=\{styles\.pasteError\}>\{props\.t\("mediaImportFailed"\)\}/);
});
