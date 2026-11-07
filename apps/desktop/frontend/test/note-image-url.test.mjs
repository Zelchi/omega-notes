import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { noteImageUrl } from '../src/pages/notes/model/note-image-url.ts';

test('stored note image URLs are scoped to both vault and image IDs', () => {
    assert.equal(
        noteImageUrl('vault-id', 'image-id'),
        'omega-image://vault-id/image-id',
    );
    assert.equal(
        noteImageUrl('vault/id', 'image id'),
        'omega-image://vault%2Fid/image%20id',
    );
});

test('legacy data URLs remain a direct image source', async () => {
    const controller = await readFile(new URL('../src/pages/notes/ui/note-image-node/controller.ts', import.meta.url), 'utf8');
    assert.match(controller, /if \(key\.startsWith\("data:"\)\) \{\s*setSource\(key\);\s*return;/);
    assert.match(controller, /setSource\(noteImageUrl\(props\.vaultId, key\)\)/);
});
