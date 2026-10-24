import { readFile, stat } from 'node:fs/promises';

export function validateStorageSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an exported localStorage object');
    const entries = Object.entries(value);
    if (entries.length > 10_000 || entries.some(([key, item]) => !key.startsWith('omega-') || key.length > 1024 || typeof item !== 'string')) throw new Error('Invalid Ômega settings export');
    if (Buffer.byteLength(JSON.stringify(value)) > 16 * 1024 * 1024) throw new Error('Settings export is too large');
    return Object.fromEntries(entries);
}
export async function readSettingsImport(argv) {
    const index = argv.indexOf('--import-settings');
    if (index < 0) return null;
    const path = argv[index + 1];
    if (!path || (await stat(path)).size > 16 * 1024 * 1024) throw new Error('Invalid settings import file');
    return validateStorageSnapshot(JSON.parse(await readFile(path, 'utf8')));
}
