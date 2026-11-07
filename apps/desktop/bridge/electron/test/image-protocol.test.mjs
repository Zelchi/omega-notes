import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { serveNoteImage } from '../image-protocol.mjs';

const requestFor = (vaultId, imageId, suffix = '') => new Request(`omega-image://${vaultId}/${imageId}${suffix}`);

test('serves local image bytes as a no-store binary response for the active vault', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'omega-image-protocol-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const vaultId = randomUUID(), imageId = randomUUID();
    const imagePath = join(directory, `${imageId}.png`);
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await writeFile(imagePath, bytes);
    const response = await serveNoteImage(requestFor(vaultId, imageId), async (requestedVault, requestedImage) => {
        assert.equal(requestedVault, vaultId);
        assert.equal(requestedImage, imageId);
        return imagePath;
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('rejects invalid image IDs before resolving a path', async () => {
    const response = await serveNoteImage(requestFor(randomUUID(), '../outside'), async () => {
        assert.fail('invalid image IDs must not reach the backend');
    });
    assert.equal(response.status, 404);
});

test('does not serve a URL belonging to a different active vault', async () => {
    const response = await serveNoteImage(requestFor(randomUUID(), randomUUID()), async () => {
        throw new Error('NOTE_IMAGE_VAULT_CHANGED');
    });
    assert.equal(response.status, 403);
});

test('returns not found for missing files and unsupported image extensions', async () => {
    const vaultId = randomUUID(), imageId = randomUUID();
    const missing = await serveNoteImage(requestFor(vaultId, imageId), async () => {
        throw new Error('Imagem não encontrada.');
    });
    const unsupported = await serveNoteImage(requestFor(vaultId, imageId), async () => '/private/file.txt');
    assert.equal(missing.status, 404);
    assert.equal(unsupported.status, 404);
});
