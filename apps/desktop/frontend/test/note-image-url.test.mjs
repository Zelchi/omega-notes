import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { noteImageUrl, resolveNoteImageSource } from '../src/pages/notes/model/note-image-url.ts';

test('Electron image URLs remain scoped to both vault and image IDs', () => {
    assert.equal(
        noteImageUrl('vault-id', 'image-id', 'electron'),
        'omega-image://vault-id/image-id',
    );
    assert.equal(
        noteImageUrl('vault/id', 'image id', 'electron'),
        'omega-image://vault%2Fid/image%20id',
    );
});

test('Tauri image URLs use the Windows localhost custom-protocol origin', () => {
    assert.equal(
        noteImageUrl('vault-id', 'image-id', 'tauri'),
        'http://omega-image.localhost/vault-id/image-id',
    );
    assert.equal(
        noteImageUrl('vault/id', 'image id', 'tauri'),
        'http://omega-image.localhost/vault%2Fid/image%20id',
    );
});

test('legacy data URLs remain a direct image source', async () => {
	const controller = await readFile(new URL('../src/pages/notes/ui/note-image-node/controller.ts', import.meta.url), 'utf8');
	assert.equal(resolveNoteImageSource('data:image/png;base64,AA==', '', false), 'data:image/png;base64,AA==');
	assert.equal(resolveNoteImageSource('image-id', 'vault-id', true, 'electron'), 'omega-image://vault-id/image-id');
	assert.equal(resolveNoteImageSource('image-id', 'vault-id', true, 'tauri'), 'http://omega-image.localhost/vault-id/image-id');
	assert.equal(resolveNoteImageSource('image-id', 'vault-id', false), '');
	assert.match(controller, /resolveNoteImageSource\(key, props\.vaultId, isDesktopRuntime\(\)\)/);
});
