import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporary = await mkdtemp(join(tmpdir(), 'omega-electron-smoke-'));
process.env.OMEGA_DEV_DOCUMENTS = temporary;
process.env.OMEGA_DEV_PROFILE = join(temporary, 'profile');
const settings = { 'omega-notes.settings.theme': 'light', 'omega-notes.archive.migration-test': JSON.stringify({ folders:[{id:'folder', name:'Preserved'}], noteFolders:{}, itemOrder:{} }) };
const settingsFile = join(temporary, 'settings.json');
await writeFile(settingsFile, JSON.stringify(settings));
process.argv.push('--import-settings', settingsFile);
const failures = [];
app.on('web-contents-created', (_event, contents) => {
    contents.on('preload-error', (_event, _path, error) => failures.push(String(error)));
    contents.on('did-fail-load', (_event, code, description) => failures.push(`load ${code}: ${description}`));
    contents.on('console-message', details => { if (details.level === 'error' || details.level === 3) failures.push(details.message); });
    contents.on('render-process-gone', (_event, details) => failures.push(`renderer ${details.reason}`));
});
const timeout = setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 30_000);
const { desktopReady, quit } = await import('./main.mjs');
if (process.platform === 'linux') assert.equal(app.commandLine.getSwitchValue('disable-features'), 'WaylandWpColorManagerV1');
desktopReady.then(async window => {
    assert.ok(window);
    const result = await window.webContents.executeJavaScript(`(async () => {
        while (!document.getElementById("root").childElementCount) await new Promise(requestAnimationFrame);
        if (!window.omegaDesktop) throw Error('Preload bridge unavailable');
        const library = await window.omegaDesktop.invoke('list_vaults', {});
        return { title: document.title, children: document.getElementById('root').childElementCount,
            buttonCount: document.querySelectorAll('button').length, vaults: library.vaults.length,
            importedTheme: localStorage.getItem("omega-notes.settings.theme"), archive: JSON.parse(localStorage.getItem("omega-notes.archive.migration-test")), appliedTheme:document.documentElement.dataset.theme, nodeExposed: typeof window.require !== 'undefined', desktop: true };
    })()`);
    assert.equal(result.title, 'Ômega Notes');
    assert.ok(result.children > 0 && result.buttonCount > 0);
    assert.equal(result.nodeExposed, false);
    assert.equal(result.importedTheme, 'light');
    assert.equal(result.appliedTheme, 'light');
    assert.equal(result.archive.folders[0].name, 'Preserved');
    await window.webContents.executeJavaScript(`(async () => {
        const library = await window.omegaDesktop.invoke('create_vault', {name:'Smoke vault'});
        await window.omegaDesktop.invoke('switch_vault', {vaultId:library.vaults.at(-1).id});
        await window.omegaDesktop.invoke('create_note', {noteTitle:'Smoke note'});
    })()`);
    const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    window.reload();
    await reloaded;
    const restored = await window.webContents.executeJavaScript(`(async () => {
        while (!document.getElementById('root').innerText.includes('Smoke note')) await new Promise(requestAnimationFrame);
        return { text:document.getElementById('root').innerText.includes('Smoke vault'), theme:localStorage.getItem('omega-notes.settings.theme') };
    })()`);
    assert.equal(restored.text, true);
    assert.equal(restored.theme, 'light');
    assert.deepEqual(failures, []);
    if (process.env.OMEGA_SMOKE_SCREENSHOT) await writeFile(process.env.OMEGA_SMOKE_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    console.log('Electron smoke passed:', JSON.stringify({ ...result, reopenedNote:true, gpuCompositing:app.getGPUFeatureStatus().gpu_compositing }));
    clearTimeout(timeout);
    await rm(temporary, { recursive: true, force: true });
    await quit();
}).catch(async error => {
    clearTimeout(timeout); console.error(error);
    await rm(temporary, { recursive: true, force: true });
    app.exit(1);
});
