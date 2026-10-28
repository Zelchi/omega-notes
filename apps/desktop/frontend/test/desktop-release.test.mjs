import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { normalizeWindowsUpdaterAsset } from '../../../../scripts/desktop-release-assets.mjs';

test('normalizes and renames the Windows updater package and signature to their published names', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'omega-release-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const source = join(directory, 'Ômega Notes_0.5.7_x64-setup.exe');
	await writeFile(source, 'package');
	await writeFile(`${source}.sig`, 'signature');

	const normalized = await normalizeWindowsUpdaterAsset(source);
	assert.equal(basename(normalized), 'Omega.Notes_0.5.7_x64-setup.exe');
	assert.equal(await readFile(normalized, 'utf8'), 'package');
	assert.equal(await readFile(`${normalized}.sig`, 'utf8'), 'signature');
});

test('release signing builds a Windows manifest from the EXE and its own signature without a ZIP', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'omega-release-manifest-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const desktop = join(directory, 'apps/desktop');
	const scripts = join(directory, 'scripts');
	const assets = join(directory, 'release-assets');
	for (const path of [scripts, assets, join(desktop, 'backend'), join(desktop, 'bridge/tauri')]) await mkdir(path, { recursive: true });
	for (const name of ['desktop-release.mjs', 'desktop-release-assets.mjs']) {
		await copyFile(new URL('../../../../scripts/' + name, import.meta.url), join(scripts, name));
	}
	await writeFile(join(desktop, 'package.json'), JSON.stringify({ version: '0.5.7' }));
	for (const path of ['backend/Cargo.toml', 'bridge/tauri/Cargo.toml']) await writeFile(join(desktop, path), 'version = "0.5.7"\n');
	await writeFile(join(desktop, 'bridge/tauri/tauri.conf.json'), JSON.stringify({ version: '0.5.7' }));
	await writeFile(join(desktop, 'bridge/key.txt'), 'fixture-public-key');
	await writeFile(join(directory, 'changelog.md'), '## v0.5.7\n\nFixture release.\n');
	for (const name of ['omega.deb', 'omega.rpm', 'Ômega Notes_0.5.7_x64-setup.exe']) await writeFile(join(assets, name), name);
	await writeFile(join(assets, 'Ômega Notes_0.5.7_x64-setup.exe.sig'), 'Ômega Notes_0.5.7_x64-setup.exe signature');
	const shim = join(directory, 'mock-signers.mjs');
	await writeFile(shim, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
childProcess.spawnSync = (command, args) => {
  if (command === 'cargo' && args.slice(0, 3).join(' ') === 'packager signer sign') {
    writeFileSync(args[3] + '.sig', readFileSync(args[3], 'utf8') + ' signature');
    return { status: 0 };
  }
  if (command.endsWith('omega-notes-backend') && args[0] === '--verify-update') {
    return { status: readFileSync(args[2], 'utf8') === readFileSync(args[1], 'utf8') + ' signature' ? 0 : 1 };
  }
  throw Error('Unexpected fixture command');
};
syncBuiltinESMExports();
`);
	const shimUrl = pathToFileURL(shim).href;
	const result = spawnSync(process.execPath, ['--import', shimUrl, join(scripts, 'desktop-release.mjs'), 'sign', assets], {
		cwd: directory,
		env: { GITHUB_REPOSITORY: 'example/omega-notes', RELEASE_TAG: 'v0.5.7', CARGO_PACKAGER_SIGN_PRIVATE_KEY: 'fixture-private-key' },
		encoding: 'utf8',
	});
	assert.equal(result.status, 0, result.stderr);
	const manifest = JSON.parse(await readFile(join(assets, 'native-latest.json'), 'utf8'));
	assert.equal(manifest.platforms['windows-x86_64'].url, 'https://github.com/example/omega-notes/releases/download/v0.5.7/Omega.Notes_0.5.7_x64-setup.exe');
	assert.equal(manifest.platforms['windows-x86_64'].signature, await readFile(join(assets, 'Omega.Notes_0.5.7_x64-setup.exe.sig'), 'utf8'));
	assert.equal(manifest.packages['linux-x86_64'].deb.signature, 'omega.deb signature');
	assert.equal(manifest.packages['linux-x86_64'].rpm.signature, 'omega.rpm signature');
	await writeFile(join(assets, 'Omega.Notes_0.5.7_x64-setup.exe.sig'), 'invalid signature');
	const rejected = spawnSync(process.execPath, ['--import', shimUrl, join(scripts, 'desktop-release.mjs'), 'sign', assets], {
		cwd: directory,
		env: { GITHUB_REPOSITORY: 'example/omega-notes', RELEASE_TAG: 'v0.5.7', CARGO_PACKAGER_SIGN_PRIVATE_KEY: 'fixture-private-key' },
		encoding: 'utf8',
	});
	assert.notEqual(rejected.status, 0);
	assert.match(rejected.stderr, /A assinatura Tauri/);
});

test('Windows release configuration and CI publish the EXE signature instead of a ZIP', async () => {
	const config = JSON.parse(await readFile(new URL('../../bridge/tauri/tauri.release.conf.json', import.meta.url), 'utf8'));
	assert.equal(config.bundle.createUpdaterArtifacts, true);
	const workflow = await readFile(new URL('../../../../.github/workflows/release.yml', import.meta.url), 'utf8');
	assert.match(workflow, /bundle\/nsis\/\*\.exe\.sig/);
	assert.doesNotMatch(workflow, /\.nsis\.zip/);
});
