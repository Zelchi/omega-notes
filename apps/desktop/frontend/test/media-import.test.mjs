import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readVideoThumbnailSource } from '../src/pages/notes/model/media-import.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('media imports recognize the image, audio, and video formats supported by the backend', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /imageExtensions = new Set\(\[.*"gif"/);
	assert.match(importer, /audioExtensions = new Set\(\[.*"opus"/);
	assert.match(importer, /videoExtensions = new Set\(\[.*"ogv"/);
	assert.match(importer, /importNoteMedia/);
	assert.match(importer, /getNoteMediaStreamUrl/);
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

test('failed files notify the editor without aborting successful files in the same batch', async () => {
	const importer = await source('../src/pages/notes/model/media-import.ts');
	assert.match(importer, /for \(const sourcePath of paths\)/);
	assert.match(importer, /catch \(error\) \{\s*console\.error\(error\);\s*onError\(\);\s*\}/);
	const editor = await source('../src/pages/notes/ui/note-canvas-editor/index.tsx');
	assert.match(editor, /role="alert" class=\{styles\.pasteError\}>\{props\.t\("mediaImportFailed"\)\}/);
});
