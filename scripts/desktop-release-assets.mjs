import { rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function normalizeWindowsUpdaterAsset(path) {
	const name = basename(path).normalize('NFKD').replace(/\p{Diacritic}/gu, '').replaceAll(' ', '.');
	const normalizedPath = join(dirname(path), name);
	if (normalizedPath === path) return path;
	await rename(path, normalizedPath);
	await rename(`${path}.sig`, `${normalizedPath}.sig`);
	return normalizedPath;
}
