import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const mode = process.argv[2] || 'prepare';
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY deve usar dono/repositorio.');
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('RELEASE_TAG deve usar vX.Y.Z.');
const version = tag.slice(1);
const metadata = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const cargo = await readFile(join(desktop, 'backend/Cargo.toml'), 'utf8');
const tauriCargo = await readFile(join(desktop, 'bridge/tauri/Cargo.toml'), 'utf8');
const tauriConfig = JSON.parse(await readFile(join(desktop, 'bridge/tauri/tauri.conf.json'), 'utf8'));
if (metadata.version !== version || /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1] !== version || /^version\s*=\s*"([^"]+)"/m.exec(tauriCargo)?.[1] !== version || tauriConfig.version !== version) throw new Error('Os manifestos desktop e a tag precisam ter a mesma versão.');
const publicKey = (process.env.OMEGA_UPDATER_PUBLIC_KEY || await readFile(join(desktop, 'bridge/electron/updater-public-key.txt'), 'utf8')).trim();
if (!publicKey) throw new Error('Chave pública ausente.');
if (mode === 'prepare') {
    await writeFile(join(desktop, 'bridge/electron/updater.json'), JSON.stringify({ endpoint: `https://github.com/${repository}/releases/latest/download/native-latest.json`, pubkey: publicKey }, null, 2) + '\n');
    tauriConfig.plugins.updater.pubkey = publicKey;
    tauriConfig.plugins.updater.endpoints = [`https://github.com/${repository}/releases/latest/download/native-latest.json`];
    await writeFile(join(desktop, 'bridge/tauri/tauri.conf.json'), JSON.stringify(tauriConfig, null, '\t') + '\n');
} else if (mode === 'sign') {
    const directory = process.argv[3] || join(desktop, 'release');
    const names = await readdir(directory);
    const artifact = (suffix, description) => {
        const matches = names.filter(name => name.endsWith(suffix));
        if (matches.length !== 1) throw new Error(`Exatamente ${description} é obrigatório.`);
        return matches[0];
    };
    const linuxPackages = ['deb', 'rpm'].map(extension => artifact(`.${extension}`, `um pacote .${extension}`));
    const windowsInstaller = artifact('.exe', 'um instalador .exe');
    const windowsArchive = artifact('.nsis.zip', 'um pacote updater .nsis.zip');
    const key = process.env.CARGO_PACKAGER_SIGN_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY;
    if (!key) throw new Error('Configure CARGO_PACKAGER_SIGN_PRIVATE_KEY.');
    const env = { ...process.env, CARGO_PACKAGER_SIGN_PRIVATE_KEY: key, CARGO_PACKAGER_SIGN_PRIVATE_KEY_PASSWORD: process.env.CARGO_PACKAGER_SIGN_PRIVATE_KEY_PASSWORD || process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '' };
    const packages = {};
    for (const name of linuxPackages) {
        const path = join(directory, name);
        if (!(await readFile(path)).length) throw new Error(`Pacote vazio: ${name}`);
        const signed = spawnSync('cargo', ['packager', 'signer', 'sign', path], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        if (signed.status !== 0) throw new Error(`Não foi possível assinar ${name}. Confira a configuração do signer.`);
        const signature = (await readFile(path + '.sig', 'utf8')).trim();
        const verifier = join(desktop, 'backend/target/release/omega-notes-backend');
        const verified = spawnSync(verifier, ['--verify-update', path, path + '.sig'], { stdio: ['ignore', 'pipe', 'pipe'] });
        if (verified.status !== 0) throw new Error(`A assinatura de ${name} não corresponde à chave pública do app.`);
        packages[name.split('.').at(-1)] = { url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(basename(name))}`, signature };
    }
    if (!(await readFile(join(directory, windowsInstaller))).length) throw new Error(`Pacote vazio: ${windowsInstaller}`);
    const windowsSignaturePath = join(directory, `${windowsArchive}.sig`);
    const windowsSignature = (await readFile(windowsSignaturePath, 'utf8')).trim();
    if (!windowsSignature) throw new Error(`Assinatura Tauri ausente: ${windowsArchive}.sig`);
    const verifier = join(desktop, 'backend/target/release/omega-notes-backend');
    const verified = spawnSync(verifier, ['--verify-update', join(directory, windowsArchive), windowsSignaturePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (verified.status !== 0) throw new Error(`A assinatura Tauri de ${windowsArchive} não corresponde à chave pública do app.`);
    const changelog = await readFile(new URL('../changelog.md', import.meta.url), 'utf8');
    const marker = `## ${tag}`;
    const start = changelog.indexOf(marker + '\n');
    if (start < 0) throw new Error(`Notas ausentes para ${tag}.`);
    const rest = changelog.slice(start + marker.length).trimStart();
    const next = rest.indexOf('\n## ');
    const notes = (next < 0 ? rest : rest.slice(0, next)).trim();
    if (!notes) throw new Error('Notas vazias.');
    const manifest = {
        version,
        notes,
        pub_date: new Date().toISOString(),
        packages: { 'linux-x86_64': { deb: packages.deb, rpm: packages.rpm } },
        platforms: {
            'linux-x86_64': packages.deb,
            'windows-x86_64': {
                url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(basename(windowsArchive))}`,
                signature: windowsSignature,
            },
        },
    };
    await writeFile(join(directory, 'native-latest.json'), JSON.stringify(manifest, null, 2) + '\n');
} else throw new Error('Use prepare ou sign.');
