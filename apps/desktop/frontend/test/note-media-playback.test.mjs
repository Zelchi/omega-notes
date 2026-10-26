import assert from 'node:assert/strict';
import test from 'node:test';
import { isNoteMediaPlaying, setNoteMediaPlaying } from '../src/shared/lib/note-media-playback.ts';

test('note media keeps lo-fi ducked until every playing media is stopped', () => {
	const first = {};
	const second = {};
	assert.equal(isNoteMediaPlaying(), false);

	setNoteMediaPlaying(first, true);
	setNoteMediaPlaying(first, true);
	setNoteMediaPlaying(second, true);
	assert.equal(isNoteMediaPlaying(), true);

	setNoteMediaPlaying(first, false);
	assert.equal(isNoteMediaPlaying(), true);
	setNoteMediaPlaying(second, false);
	assert.equal(isNoteMediaPlaying(), false);
});

test('stopping an unregistered media does not disturb other playback', () => {
	const active = {};
	const inactive = {};
	setNoteMediaPlaying(active, true);
	setNoteMediaPlaying(inactive, false);
	assert.equal(isNoteMediaPlaying(), true);
	setNoteMediaPlaying(active, false);
	assert.equal(isNoteMediaPlaying(), false);
});
