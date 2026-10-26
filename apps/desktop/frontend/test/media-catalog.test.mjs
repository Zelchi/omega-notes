import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useMediaCatalogDialogController } from '../src/pages/notes/ui/media-catalog-dialog/controller.ts';
import { deferred, settle } from './helpers.mjs';

const note = (id, title = id) => ({
	id,
	title,
	updatedAt: 0,
	document: { format: 'omega-document', version: 1, page: { width: 794, height: 1123 }, elements: [] },
});

const setup = async (t, loadMediaCatalog) => {
	let catalog;
	const [open, setOpen] = createSignal(true);
	const [currentNote, setCurrentNote] = createSignal(note('current'));
	const [notes, setNotes] = createSignal([note('current')]);
	createRoot(dispose => {
		t.after(dispose);
		catalog = useMediaCatalogDialogController({
			get open() { return open(); },
			currentNote,
			notes,
			loadMediaCatalog,
			t: key => key,
			onClose: () => setOpen(false),
			onSelect: () => {},
			onImportFiles: async () => {},
			onImportPaths: async () => {},
		});
	});
	await settle();
	return { catalog, setCurrentNote, setNotes, setOpen };
};

test('catalog load failure is exposed and can be retried', async t => {
	const logged = t.mock.method(console, 'error', () => {});
	let attempts = 0;
	const f = await setup(t, async () => {
		attempts += 1;
		if (attempts === 1) throw Error('read failed');
		return [{ noteId: 'other', noteTitle: 'Other note', elementId: 'image-1', source: { type: 'image', imageId: 'image-id' } }];
	});

	assert.equal(f.catalog.loadError(), true);
	assert.equal(logged.mock.callCount(), 1);
	f.catalog.retryLoad();
	await settle();
	assert.equal(attempts, 2);
	assert.equal(f.catalog.loadError(), false);
	assert.equal(f.catalog.filtered().length, 1);
});

test('media from an earlier vault context is discarded after a context change', async t => {
	const oldLoad = deferred();
	const newLoad = deferred();
	let attempts = 0;
	const f = await setup(t, () => ++attempts === 1 ? oldLoad.promise : newLoad.promise);
	f.setCurrentNote(note('next-vault-note'));
	f.setNotes([note('next-vault-note')]);
	await settle();
	assert.equal(attempts, 2);
	oldLoad.resolve([{ noteId: 'old', noteTitle: 'Old vault', elementId: 'a', source: { type: 'audio', audioId: 'old-audio', extension: 'mp3' } }]);
	await settle();
	assert.deepEqual(f.catalog.filtered(), []);
	newLoad.resolve([{ noteId: 'new', noteTitle: 'New vault', elementId: 'b', source: { type: 'image', imageId: 'new-image' } }]);
	await settle();
	assert.deepEqual(f.catalog.filtered().map(item => item.noteTitles), [['New vault']]);
});

test('catalog groups shared image, audio, and video references by media id', async t => {
	const f = await setup(t, async () => [
		{ noteId: 'first', noteTitle: 'First', elementId: 'image-a', source: { type: 'image', imageId: 'shared-image' } },
		{ noteId: 'second', noteTitle: 'Second', elementId: 'image-b', source: { type: 'image', imageId: 'shared-image' } },
		{ noteId: 'audio-note', noteTitle: 'Audio note', elementId: 'audio-a', source: { type: 'audio', audioId: 'audio-id', extension: 'mp3' } },
		{ noteId: 'other-audio-note', noteTitle: 'Other audio note', elementId: 'audio-b', source: { type: 'audio', audioId: 'audio-id', extension: 'mp3' } },
		{ noteId: 'video-note', noteTitle: 'Video note', elementId: 'video', source: { type: 'video', videoId: 'video-id', extension: 'mp4' } },
	]);

	const media = f.catalog.filtered();
	assert.equal(media.length, 3);
	assert.deepEqual(media.find(item => item.source.type === 'image').noteTitles, ['First', 'Second']);
	assert.deepEqual(media.find(item => item.source.type === 'audio').noteTitles, ['Audio note', 'Other audio note']);
	assert.ok(media.some(item => item.source.type === 'video'));
});

test('media catalog exposes retry and supports selecting all media types', async () => {
	const source = await readFile(new URL('../src/pages/notes/ui/media-catalog-dialog/index.tsx', import.meta.url), 'utf8');
	assert.match(source, /props\.catalog\.loadError\(\)/);
	assert.match(source, /props\.catalog\.retryLoad/);
	assert.match(source, /styles\.mediaIcon/);
	assert.match(source, /media\.source\.type === "image" \|\| \(media\.source\.type === "video" && !!props\.catalog\.sources\(\)\[media\.id\]\)/);
	assert.match(source, /accept="[^\"]*\.aac[^\"]*\.mp4[^\"]*\.webm/);
});
