import assert from 'node:assert/strict';
import test from 'node:test';
import { getNote, listDeletedNotes, setNotesVaultId } from '../src/entities/note/api/browser-notes.repository.ts';

test('browser storage removes legacy audio and video elements from active and deleted notes', async () => {
	const storage = new Map();
	const previousStorage = globalThis.localStorage;
	globalThis.localStorage = {
		getItem: key => storage.get(key) ?? null,
		setItem: (key, value) => storage.set(key, value),
	};
	setNotesVaultId('legacy-media-test');
	const note = {
		id: 'legacy-note',
		title: 'Legacy media',
		updatedAt: 1,
		document: {
			format: 'omega-document',
			version: 1,
			page: { width: 794, height: 1123 },
			elements: [
				{ type: 'text', id: 'text', x: 0, y: 0, width: 100, height: 40, text: 'Keep', alignment: 'left' },
				{ type: 'image', id: 'image', x: 0, y: 50, width: 100, height: 100, imageId: 'image' },
				{ type: 'audio', id: 'audio', x: 0, y: 160, width: 100, height: 40, audioId: 'audio', extension: 'mp3', volume: 999 },
				{ type: 'video', id: 'video', x: 0, y: 210, width: 100, height: 100, videoId: 'video', extension: 'mp4' },
			],
		},
	};
	const notesKey = 'omega-notes.notes.v1:legacy-media-test';
	storage.set(notesKey, JSON.stringify([note]));
	storage.set(`${notesKey}:deleted`, JSON.stringify([note]));

	try {
		const active = await getNote('legacy-media-test', 'legacy-note');
		const deleted = await listDeletedNotes();
		for (const migrated of [active, deleted[0]]) {
			assert.deepEqual(migrated.document.elements.map(element => element.type), ['text', 'image']);
		}
		for (const key of [notesKey, `${notesKey}:deleted`]) {
			assert.deepEqual(JSON.parse(storage.get(key))[0].document.elements.map(element => element.type), ['text', 'image']);
		}
	} finally {
		setNotesVaultId(undefined);
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	}
});
