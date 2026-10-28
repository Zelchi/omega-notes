import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { normalizeWindowsUpdaterAsset } from '../../../../scripts/desktop-release-assets.mjs';

test('normalizes and renames the Windows updater package and signature to their published names', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'omega-release-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const source = join(directory, 'Ômega Notes_0.5.7_x64-setup.nsis.zip');
	await writeFile(source, 'package');
	await writeFile(`${source}.sig`, 'signature');

	const normalized = await normalizeWindowsUpdaterAsset(source);
	assert.equal(basename(normalized), 'Omega.Notes_0.5.7_x64-setup.nsis.zip');
	assert.equal(await readFile(normalized, 'utf8'), 'package');
	assert.equal(await readFile(`${normalized}.sig`, 'utf8'), 'signature');
	const releaseScript = await readFile(new URL('../../../../scripts/desktop-release.mjs', import.meta.url), 'utf8');
	assert.match(releaseScript, /d=await W\(g\("\.nsis\.zip"/);
});
