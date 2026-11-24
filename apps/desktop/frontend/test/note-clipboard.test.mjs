import assert from 'node:assert/strict';
import test from 'node:test';
import { readNoteClipboard, readNoteClipboardEvent } from '../src/pages/notes/ui/note-text-node/clipboard.ts';

const clipboardItem = (values) => ({
	types: Object.keys(values),
	async getType(type) {
		const value = values[type];
		return typeof value === 'string' ? { text: async () => value } : value;
	},
});

const htmlParser = () => {
	const text = value => ({ nodeType: 3, textContent: value, childNodes: [] });
	const element = (tagName, children = []) => {
		const node = {
			nodeType: 1,
			tagName: tagName.toUpperCase(),
			childNodes: children,
			style: { fontWeight: '', fontStyle: '', textDecorationLine: '', textDecoration: '', backgroundColor: '', fontFamily: '', textAlign: '' },
			getAttribute: () => null,
		};
		Object.defineProperty(node, 'textContent', { get: () => children.map(child => child.textContent ?? '').join('') });
		return node;
	};
	return class {
		parseFromString() {
			return { body: element('body', [element('p', [element('strong', [text('rich')])])]) };
		}
	};
};

test('context paste prefers converted rich text and falls back to plain text', async () => {
	const previousParser = globalThis.DOMParser;
	globalThis.DOMParser = htmlParser();
	try {
		const result = await readNoteClipboard({
			read: async () => [clipboardItem({ 'text/html': '<p><strong>rich</strong></p>', 'text/plain': 'plain' })],
			readText: async () => 'system fallback',
		}, false, false);
		assert.deepEqual(result, { images: [], text: '**rich**' });
	} finally {
		if (previousParser === undefined) delete globalThis.DOMParser;
		else globalThis.DOMParser = previousParser;
	}

	const fallback = await readNoteClipboard({
		read: async () => [clipboardItem({ 'text/html': '<p>rich</p>', 'text/plain': 'plain' })],
		readText: async () => 'system fallback',
	}, false, false);
	assert.deepEqual(fallback, { images: [], text: 'plain' });
});

test('plain-text paste skips clipboard items, and failed rich reads fall back to readText', async () => {
	let itemReads = 0;
	const plain = await readNoteClipboard({
		read: async () => { itemReads++; return []; },
		readText: async () => 'plain text',
	}, true, true);
	assert.deepEqual(plain, { images: [], text: 'plain text' });
	assert.equal(itemReads, 0);

	const fallback = await readNoteClipboard({
		read: async () => { throw new Error('unsupported'); },
		readText: async () => 'text fallback',
	}, false, false);
	assert.deepEqual(fallback, { images: [], text: 'text fallback' });
});

test('image paste returns supported image files when a handler is available', async () => {
	const result = await readNoteClipboard({
		read: async () => [clipboardItem({
			'IMAGE/PNG': new Blob(['image'], { type: 'image/png' }),
			'text/plain': 'image description',
		})],
		readText: async () => 'system fallback',
	}, false, true);
	assert.equal(result.text, undefined);
	assert.equal(result.images.length, 1);
	assert.equal(result.images[0].name, 'clipboard-image-1.png');
	assert.equal(result.images[0].type, 'image/png');
});

test('unsupported images do not replace available text', async () => {
	const result = await readNoteClipboard({
		read: async () => [clipboardItem({
			'image/svg+xml': new Blob(['<svg />'], { type: 'image/svg+xml' }),
			'text/plain': 'plain text',
		})],
		readText: async () => 'system fallback',
	}, false, true);
	assert.deepEqual(result, { images: [], text: 'plain text' });
});

test('paste events convert rich HTML, normalize text, and fall back to plain text', () => {
	const previousParser = globalThis.DOMParser;
	globalThis.DOMParser = htmlParser();
	try {
		assert.deepEqual(readNoteClipboardEvent({
			files: [],
			getData: type => type === 'text/html' ? '<p>rich</p>' : 'plain',
		}, false, false), { images: [], text: '**rich**' });
	} finally {
		if (previousParser === undefined) delete globalThis.DOMParser;
		else globalThis.DOMParser = previousParser;
	}

	assert.deepEqual(readNoteClipboardEvent({
		files: [],
		getData: type => type === 'text/html' ? '<p>rich</p>' : '\uFEFFcafe\u0301\r\nnext',
	}, false, false), { images: [], text: 'café\nnext' });
});

test('paste events prioritize supported image files only when image handling is available', () => {
	const image = new File(['image'], 'pasted.png', { type: 'image/png' });
	const data = { files: [image], getData: type => type === 'text/plain' ? 'description' : '' };
	assert.deepEqual(readNoteClipboardEvent(data, false, true), { images: [image] });
	assert.deepEqual(readNoteClipboardEvent(data, false, false), { images: [], text: 'description' });
	assert.deepEqual(readNoteClipboardEvent(data, true, true), { images: [], text: 'description' });
});
