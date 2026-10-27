import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Backend } from '../backend.mjs';
const directory = dirname(fileURLToPath(import.meta.url));
const executable = join(directory, '../../../backend/target/debug', `omega-notes-backend${process.platform === 'win32' ? '.exe' : ''}`);

test('real Rust process preserves vaults, notes, streams, images and errors across RPC', async t => {
    const temp = await mkdtemp(join(tmpdir(), 'omega-electron-test-'));
    const events = [];
    const failures = [];
    const backend = new Backend(executable, ['--documents-dir', temp, '--cache-dir', join(temp, 'cache')], event => events.push(event), error => failures.push(error));
    t.after(async () => { await backend.stop(); await rm(temp, { recursive: true, force: true }); });
    await backend.ready();
    const created = await backend.invoke('create_vault', { name: 'Electron test' });
    const vaultId = created.vaults.at(-1).id;
    await backend.invoke('switch_vault', { vaultId });
    const original = await backend.invoke('create_note', { noteTitle: 'First note' });
    const document = structuredClone(original.document);
    document.elements[0].text = 'Saved through Electron IPC';
    const saved = await backend.invoke('save_note', { vaultId, noteId: original.id, noteTitle: original.title, document, expectedNote: { title: original.title, document: original.document } });
    assert.equal(saved.note.document.elements[0].text, 'Saved through Electron IPC');
    const channel = randomUUID();
    await backend.invoke('stream_note_summaries', { vaultId, observerId: randomUUID(), resetObserverSnapshot: true, external: false, operationId: randomUUID(), onItem: { __omegaChannel: channel } });
    const stream = events.filter(event => event.channel === channel).map(event => event.payload);
    assert.equal(stream[0].event, 'item');
    assert.equal(stream[0].data.id, original.id);
    assert.equal(stream.at(-1).event, 'complete');
    const cancelledOperation = randomUUID(), cancelledChannel = randomUUID();
    await backend.invoke('cancel_note_read', { operationId: cancelledOperation });
    await assert.rejects(backend.invoke('stream_note_summaries', {
        vaultId, observerId: randomUUID(), resetObserverSnapshot: true, external: false,
        operationId: cancelledOperation, onItem: { __omegaChannel: cancelledChannel },
    }), /NOTE_READ_CANCELLED/);
    assert.equal(events.some(event => event.channel === cancelledChannel), false);
    const png = Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8r8AAAAASUVORK5CYII=', 'base64'));
    png.push(...new Uint8Array(1));
    const payload = [...png, ...new Uint8Array(512 * 1024)];
    const imageId = await backend.invoke('import_clipboard_image', { bytes: payload });
    const imageChannel = randomUUID();
    const byteLength = await backend.invoke('read_note_image', { imageId, onChunk: { __omegaChannel: imageChannel } });
    assert.equal(byteLength, payload.length);
    const downloaded = Buffer.concat(events.filter(event => event.channel === imageChannel).map(event => Buffer.from(event.payload, 'base64')));
    assert.deepEqual([...downloaded], payload);
    assert.ok(events.filter(event => event.channel === imageChannel).length > 1);
    assert.ok(events.filter(event => event.channel === imageChannel).every(event => event.payload.length <= 256 * 1024));
    await assert.rejects(backend.invoke('read_note_image', { imageId: '../../outside', onChunk: { __omegaChannel: randomUUID() } }));
    await assert.rejects(backend.invoke('save_note', { vaultId, noteId: original.id, noteTitle: original.title, document: original.document, expectedNote: { title: original.title, document: original.document } }), /CONFLICT|ALTERAD|changed/i);
    await assert.rejects(backend.invoke('not_a_command'), /Unknown backend command/);
    await assert.rejects(backend.invoke('get_note', { vaultId }), /Invalid argument noteId/);
    await assert.rejects(backend.invoke('music_stream_url', { url: 'https://127.0.0.1/live.mp3' }), /MUSIC_URL_INVALID/);
    const musicUrl = await backend.invoke('music_stream_url', { url: 'https://radio.example/live.mp3' });
    assert.match(musicUrl, /^http:\/\/127\.0\.0\.1:\d+\/music\//);
    const results = await Promise.all(Array.from({ length: 12 }, () => backend.invoke('get_note', { vaultId, noteId: original.id })));
    assert.ok(results.every(value => value.document.elements[0].text === 'Saved through Electron IPC'));
    assert.deepEqual(await backend.invoke('list_deleted_note_ids', { vaultId, operationId: randomUUID() }), []);
    const otherVault = await backend.invoke('create_vault', { name: 'Other vault' });
    await backend.invoke('switch_vault', { vaultId: otherVault.vaults.at(-1).id });
    await assert.rejects(backend.invoke('list_deleted_note_ids', { vaultId, operationId: randomUUID() }), /NOTE_LOAD_VAULT_CHANGED/);
    const files = await readFile(join(temp, 'Ômega Notes Dev', 'vaults.json'), 'utf8');
    assert.ok(files.includes('Electron test'));
    assert.equal(await backend.invoke('updater_ready'), false);
    assert.deepEqual(failures, []);
});

test('a crashing backend rejects requests instead of leaving pending promises', async t => {
    const backend = new Backend(process.execPath, ['-e', `process.stdout.write('{"ready":true}\\n');process.stdin.once('data',()=>process.exit(7))`], () => {}, () => {});
    t.after(() => backend.stop());
    await assert.rejects(backend.invoke('example'), /Backend exited/);
});

test('note summaries remain available after repeated vault round trips', async t => {
    const temp = await mkdtemp(join(tmpdir(), 'omega-vault-roundtrip-'));
    const events = [];
    const backend = new Backend(executable, ['--documents-dir', temp, '--cache-dir', join(temp, 'cache')], event => events.push(event), () => {});
    t.after(async () => { await backend.stop(); await rm(temp, { recursive: true, force: true }); });
    await backend.ready();
    const first = await backend.invoke('create_vault', { name: 'First' });
    const firstId = first.vaults.at(-1).id;
    const second = await backend.invoke('create_vault', { name: 'Second' });
    const secondId = second.vaults.at(-1).id;
    await backend.invoke('switch_vault', { vaultId: firstId });
    const firstNote = await backend.invoke('create_note', { noteTitle: 'First note' });
    await backend.invoke('switch_vault', { vaultId: secondId });
    const secondNote = await backend.invoke('create_note', { noteTitle: 'Second note' });
    const observerId = randomUUID();

    for (const [vaultId, expectedNoteId] of [
        [firstId, firstNote.id], [secondId, secondNote.id], [firstId, firstNote.id],
        [secondId, secondNote.id], [firstId, firstNote.id],
    ]) {
        await backend.invoke('switch_vault', { vaultId });
        const channel = randomUUID();
        await backend.invoke('stream_note_summaries', {
            vaultId, observerId, resetObserverSnapshot: true, external: false,
            operationId: randomUUID(), onItem: { __omegaChannel: channel },
        });
        const stream = events.filter(event => event.channel === channel).map(event => event.payload);
        assert.equal(stream.at(-1).event, 'complete');
        assert.ok(stream.some(event => event.event === 'item' && event.data.id === expectedNoteId));
    }
});

test('note summary loading survives entries the external observer cannot index', async t => {
    if (process.platform === 'win32') return t.skip('non-UTF-8 filenames are not supported on Windows');
    const temp = await mkdtemp(join(tmpdir(), 'omega-invalid-note-entry-'));
    const events = [];
    const backend = new Backend(executable, ['--documents-dir', temp, '--cache-dir', join(temp, 'cache')], event => events.push(event), () => {});
    t.after(async () => { await backend.stop(); await rm(temp, { recursive: true, force: true }); });
    await backend.ready();
    const library = await backend.invoke('create_vault', { name: 'Invalid entry test' });
    const vaultId = library.vaults.at(-1).id;
    await backend.invoke('switch_vault', { vaultId });
    const note = await backend.invoke('create_note', { noteTitle: 'Still readable' });
    const notesPath = Buffer.from(join(temp, 'Ômega Notes Dev', 'vaults', vaultId, 'notes'));
    await writeFile(Buffer.concat([notesPath, Buffer.from('/'), Buffer.from([0xff]), Buffer.from('.omega')]), 'invalid');

    for (const external of [false, true]) {
        const channel = randomUUID();
        await backend.invoke('stream_note_summaries', {
            vaultId, observerId: randomUUID(), resetObserverSnapshot: true, external,
            operationId: randomUUID(), onItem: { __omegaChannel: channel },
        });
        const stream = events.filter(event => event.channel === channel).map(event => event.payload);
        assert.equal(stream.at(-1).event, 'complete');
        assert.ok(stream.some(event => event.event === 'item' && event.data.id === note.id));
        assert.ok(stream.at(-1).data.issues.length > 0);
    }
});
