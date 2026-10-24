import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('media imports recognize the image, audio, and video formats supported by the backend', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /imageExtensions = new Set\(\[.*"gif"/);
	assert.match(importer, /audioExtensions = new Set\(\[.*"opus"/);
	assert.match(importer, /videoExtensions = new Set\(\[.*"ogv"/);
	assert.match(importer, /importNoteMedia/);
	assert.match(importer, /getNoteMediaStreamUrl/);
});

test('failed files notify the editor without aborting successful files in the same batch', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /for \(const sourcePath of paths\)/);
	assert.match(importer, /catch \(error\) \{\s*console\.error\(error\);\s*onError\(\);\s*\}/);
	const editor = await source('../src/pages/notes/ui/note-canvas-editor/index.tsx');
	assert.match(editor, /role="alert" class=\{styles\.pasteError\}>\{props\.t\("mediaImportFailed"\)\}/);
});
