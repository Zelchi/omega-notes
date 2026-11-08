import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { decodePdfDocuments, decodePdfHighlights, maxPdfBytes, maxPdfHighlightTextLength, maxPdfTitleLength, updatePdfHighlight } from '../src/features/manage-pdfs/api/pdfs.repository.ts';
import { usePdfLibrary } from '../src/features/manage-pdfs/model/controller.ts';

const document = (overrides = {}) => ({
	id: '018f4f1a-7b2c-7abc-8def-0123456789ab',
	title: 'A title chosen by the reader',
	sizeBytes: 42,
	importedAt: 1_700_000_000_000,
	lastPage: 3,
	pageCount: 12,
	...overrides,
});

test('PDF collection decoding keeps the user-facing title and reading progress', () => {
	assert.deepEqual(decodePdfDocuments([document()]), [document()]);
});

test('PDF collection decoding rejects duplicate IDs and invalid records', () => {
	assert.throws(() => decodePdfDocuments([document(), document()]));
	assert.throws(() => decodePdfDocuments([document({ title: '  ' })]));
	assert.throws(() => decodePdfDocuments([document({ sizeBytes: maxPdfBytes + 1 })]));
	assert.throws(() => decodePdfDocuments([document({ title: 'x'.repeat(maxPdfTitleLength + 1) })]));
	assert.throws(() => decodePdfDocuments([document({ lastPage: 13 })]));
});

test('PDF highlights decode normalized geometry and reject invalid or duplicate marks', () => {
	const highlight = {
		id: '018f4f1a-7b2c-7abc-8def-0123456789ac', page: 2, text: 'Selected text',
		rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
		color: 'yellow', noteId: null,
	};
	assert.deepEqual(decodePdfHighlights([highlight]), [highlight]);
	assert.deepEqual(decodePdfHighlights([{ ...highlight, color: undefined, noteId: undefined }]), [{ ...highlight, color: 'yellow', noteId: null }]);
	assert.throws(() => decodePdfHighlights([highlight, highlight]));
	assert.throws(() => decodePdfHighlights([{ ...highlight, text: 'x'.repeat(maxPdfHighlightTextLength + 1) }]));
	assert.throws(() => decodePdfHighlights([{ ...highlight, rects: [{ ...highlight.rects[0], x: 0.9 }] }]));
	assert.throws(() => decodePdfHighlights([{ ...highlight, color: 'orange' }]));
	assert.throws(() => decodePdfHighlights([{ ...highlight, noteId: 'not-a-uuid' }]));
});

const defer = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const withDesktop = async (invoke, run) => {
	const previousWindow = globalThis.window;
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: { omegaDesktop: { invoke, onEvent: () => () => {}, onChannel: () => () => {}, pathForFile: () => '' } },
	});
	try { await run(); }
	finally {
		if (previousWindow === undefined) delete globalThis.window;
		else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
	}
};

test('PDF loads from a previous Vault cannot overwrite the selected Vault', async () => {
	const firstRead = defer();
	await withDesktop((command, args) => {
		if (command === 'read_pdf_documents' && args.vaultId === 'vault-a') return firstRead.promise;
		if (command === 'read_pdf_documents' && args.vaultId === 'vault-b') return Promise.resolve([document({ id: '118f4f1a-7b2c-7abc-8def-0123456789ab', title: 'Vault B' })]);
		throw Error(`Unexpected command: ${command}`);
	}, async () => {
		let dispose;
		const [vaultId, setVaultId] = createSignal('vault-a');
		let library;
		createRoot(unmount => { dispose = unmount; library = usePdfLibrary(vaultId, key => key); });
		await tick();
		setVaultId('vault-b');
		await tick();
		firstRead.resolve([document()]);
		await tick();
		assert.deepEqual(library.documents().map(item => item.title), ['Vault B']);
		dispose();
	});
});

test('an import finishing after a Vault switch is never attached to the new Vault', async () => {
	const importRequest = defer();
	let importedArgs;
	await withDesktop((command, args) => {
		if (command === 'read_pdf_documents') return Promise.resolve([]);
		if (command === 'dialog_open') return Promise.resolve('/outside/original-filename.pdf');
		if (command === 'import_pdf_document') { importedArgs = args; return importRequest.promise; }
		throw Error(`Unexpected command: ${command}`);
	}, async () => {
		let dispose;
		const [vaultId, setVaultId] = createSignal('vault-a');
		let library;
		createRoot(unmount => { dispose = unmount; library = usePdfLibrary(vaultId, key => key); });
		await tick();
		await library.selectPdf();
		library.setTitleDraft('My chosen title');
		const importing = library.importSelected();
		setVaultId('vault-b');
		importRequest.resolve(document({ title: 'My chosen title' }));
		await importing;
		await tick();
		assert.deepEqual(importedArgs, { vaultId: 'vault-a', sourcePath: '/outside/original-filename.pdf', title: 'My chosen title' });
		assert.deepEqual(library.documents(), []);
		dispose();
	});
});

test('reading progress is restored from the catalog and duplicate renders are not rewritten', async () => {
	const saved = [];
	await withDesktop((command, args) => {
		if (command === 'read_pdf_documents') return Promise.resolve([document({ lastPage: 7 })]);
		if (command === 'save_pdf_progress') { saved.push(args); return Promise.resolve(); }
		throw Error(`Unexpected command: ${command}`);
	}, async () => {
		let dispose;
		const [vaultId] = createSignal('vault-a');
		let library;
		createRoot(unmount => { dispose = unmount; library = usePdfLibrary(vaultId, key => key); });
		await tick();
		assert.equal(library.documents()[0].lastPage, 7);
		library.saveProgress(document().id, 8, 12);
		await library.flushSave();
		library.saveProgress(document().id, 8, 12);
		await library.flushSave();
		assert.equal(saved.length, 1);
		assert.equal(saved[0].page, 8);
		dispose();
	});
});

test('highlight updates persist the selected color and linked note', async () => {
	const highlight = {
		id: '018f4f1a-7b2c-7abc-8def-0123456789ac', page: 2, text: 'Selected text',
		rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }], color: 'purple',
		noteId: '118f4f1a-7b2c-7abc-8def-0123456789ac',
	};
	await withDesktop((command, args) => {
		assert.equal(command, 'update_pdf_highlight');
		assert.deepEqual(args, { vaultId: 'vault-a', documentId: document().id, highlight });
		return Promise.resolve([highlight]);
	}, async () => {
		assert.deepEqual(await updatePdfHighlight('vault-a', document().id, highlight), [highlight]);
	});
});

test('PDF library and reader are included in the desktop app and use range streaming', async () => {
	const [app, titlebar, panel, reader, vite, tauri] = await Promise.all([
		import('node:fs/promises').then(fs => fs.readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8')),
		import('node:fs/promises').then(fs => fs.readFile(new URL('../src/app/ui/window-titlebar/index.tsx', import.meta.url), 'utf8')),
		import('node:fs/promises').then(fs => fs.readFile(new URL('../src/features/manage-pdfs/ui/pdf-panel/index.tsx', import.meta.url), 'utf8')),
		import('node:fs/promises').then(fs => fs.readFile(new URL('../src/features/manage-pdfs/ui/pdf-reader.tsx', import.meta.url), 'utf8')),
		import('node:fs/promises').then(fs => fs.readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')),
		import('node:fs/promises').then(fs => fs.readFile(new URL('../../bridge/tauri/tauri.conf.json', import.meta.url), 'utf8')),
	]);
	assert.match(app, /PdfPanel = lazy\(\(\) => import\("@\/features\/manage-pdfs\/ui\/pdf-panel"\)\)/);
	assert.match(titlebar, /onClick=\{\(\) => runAppAction\(props\.onPdfs, "panel"/);
	assert.match(panel, /props\.library\.selectPdf\(\)/);
	assert.match(reader, /disableStream: true,[\s\S]*?disableAutoFetch: true/);
	assert.match(reader, /pdf\.worker\.mjs\?url/);
	assert.match(reader, /iccUrl: staticAssetUrl\("iccs"\)/);
	assert.match(reader, /new TextLayer\(/);
	assert.match(reader, /saveSelectionAsHighlight/);
	assert.match(reader, /deletePdfHighlight/);
	assert.match(reader, /onContextMenu=\{openSelectionMenu\}/);
	assert.match(reader, /useNoteLinkSuggestions/);
	assert.match(reader, /<NoteLinkSuggestions/);
	assert.doesNotMatch(reader, /import Dropdown/);
	assert.match(reader, /pdfEditHighlight/);
	assert.match(reader, /onClick=\{openLinkedHighlight\}/);
	assert.match(reader, /updatePdfHighlight/);
	assert.match(reader, /https:\/\/www\.google\.com\/search\?q=/);
	assert.match(reader, /<Icon name="highlight" size=\{15\} \/>/);
	assert.match(vite, /connect-src 'self' http:\/\/127\.0\.0\.1:\*/);
	assert.match(tauri, /connect-src 'self' http:\/\/127\.0\.0\.1:\*/);
	assert.doesNotMatch(panel, /\stitle=/);
});
