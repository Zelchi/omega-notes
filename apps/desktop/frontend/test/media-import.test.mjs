import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importMediaPaths, readMediaSource, readVideoThumbnailSource } from '../src/pages/notes/model/media-import.ts';
import { mockDesktop } from './helpers.mjs';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

const withDesktop = (t, invoke) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	globalThis.window = { omegaDesktop: mockDesktop(invoke) };
	t.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
		else delete globalThis.window;
	});
};

test('media imports route supported image, audio, and video files through desktop commands', async t => {
	const calls = [];
	withDesktop(t, async (command, args) => {
		calls.push({ command, args });
		if (command === 'import_note_image') return 'image-id';
		if (command === 'import_note_media') return `${args.mediaType}-id`;
		if (command === 'note_media_stream_url') return `omega-media://${args.mediaType}/${args.mediaId}`;
		throw Error(`Unexpected command: ${command}`);
	});

	const imported = await importMediaPaths(['/tmp/cover.GIF', '/tmp/voice.opus', '/tmp/clip.ogv']);
	assert.deepEqual(imported, [
		{ type: 'image', imageId: 'image-id' },
		{ type: 'audio', audioId: 'audio-id', extension: 'opus' },
		{ type: 'video', videoId: 'video-id', extension: 'ogv' },
	]);
	assert.equal(await readMediaSource('audio-id', 'audio'), 'omega-media://audio/audio-id');
	assert.deepEqual(calls, [
		{ command: 'import_note_image', args: { sourcePath: '/tmp/cover.GIF' } },
		{ command: 'import_note_media', args: { sourcePath: '/tmp/voice.opus', mediaType: 'audio' } },
		{ command: 'import_note_media', args: { sourcePath: '/tmp/clip.ogv', mediaType: 'video' } },
		{ command: 'note_media_stream_url', args: { mediaId: 'audio-id', mediaType: 'audio' } },
	]);
});

test('video thumbnails capture and downscale the midpoint frame', async t => {
	let drawnFrame;
	const video = new EventTarget();
	Object.assign(video, {
		preload: '', muted: false, playsInline: false, readyState: 0, videoWidth: 1280, videoHeight: 720, duration: 24, src: '', currentTime: 0,
		load() {
			if (!this.src) return;
			queueMicrotask(() => {
				this.readyState = 1;
				this.dispatchEvent(new Event('loadedmetadata'));
			});
		},
		pause() {},
		removeAttribute(name) { if (name === 'src') this.src = ''; },
	});
	Object.defineProperty(video, 'currentTime', {
		get() { return this._currentTime ?? 0; },
		set(value) {
			this._currentTime = value;
			queueMicrotask(() => {
				this.readyState = 2;
				this.dispatchEvent(new Event('seeked'));
			});
		},
		configurable: true,
	});
	const canvas = {
		width: 0,
		height: 0,
		getContext: () => ({ drawImage: (...args) => { drawnFrame = args; } }),
		toBlob: callback => callback(new Blob(['frame'], { type: 'image/jpeg' })),
	};
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: { createElement: tag => tag === 'video' ? video : canvas },
	});
	t.after(() => {
		if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
		else delete globalThis.document;
	});

	const thumbnail = await readVideoThumbnailSource(
		{ type: 'video', dataUrl: 'data:video/mp4;base64,AA==', extension: 'mp4' },
		new AbortController().signal,
	);
	t.after(() => URL.revokeObjectURL(thumbnail));

	assert.match(thumbnail, /^blob:/);
	assert.equal(canvas.width, 320);
	assert.equal(canvas.height, 180);
	assert.deepEqual(drawnFrame, [video, 0, 0, 320, 180]);
	assert.equal(video.muted, true);
	assert.equal(video.currentTime, 12);
});

test('failed files notify the editor without aborting successful files in the same batch', async t => {
	const previousConsoleError = console.error;
	const calls = [];
	const errors = [];
	let notified = 0;
	withDesktop(t, async (command, args) => {
		calls.push({ command, args });
		return `${args.mediaType}-id`;
	});
	console.error = error => errors.push(error);
	t.after(() => { console.error = previousConsoleError; });

	const media = await importMediaPaths(
		['/tmp/voice.mp3', '/tmp/unsupported.txt', '/tmp/clip.webm'],
		() => true,
		() => { notified++; },
	);
	assert.deepEqual(media, [
		{ type: 'audio', audioId: 'audio-id', extension: 'mp3' },
		{ type: 'video', videoId: 'video-id', extension: 'webm' },
	]);
	assert.equal(notified, 1);
	assert.equal(errors.length, 1);
	assert.match(errors[0].message, /Unsupported media format/);
	assert.deepEqual(calls, [
		{ command: 'import_note_media', args: { sourcePath: '/tmp/voice.mp3', mediaType: 'audio' } },
		{ command: 'import_note_media', args: { sourcePath: '/tmp/clip.webm', mediaType: 'video' } },
	]);

	const editor = await source('../src/pages/notes/ui/note-canvas-editor/index.tsx');
	assert.match(editor, /role="alert" class=\{styles\.pasteError\}>\{props\.t\("mediaImportFailed"\)\}/);
});
