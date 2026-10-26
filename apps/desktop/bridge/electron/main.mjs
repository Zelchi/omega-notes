import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Backend } from './backend.mjs';
import { readSettingsImport, validateStorageSnapshot } from './storage.mjs';
import { installAndRelaunch } from './updater-install.mjs';
if (process.platform === 'linux') app.commandLine.appendSwitch('disable-features', 'WaylandWpColorManagerV1');
let settingsImport = await readSettingsImport(process.argv);

const directory = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(directory, '../..');
process.env.VITE_DESKTOP_RUNTIME = 'electron';
const commands = new Set(JSON.parse(await readFile(join(directory, 'backend-commands.json'), 'utf8')));
const development = !app.isPackaged;
const devUrl = development && process.env.OMEGA_DEV_URL;
if (development) app.setPath('userData', process.env.OMEGA_DEV_PROFILE || join(app.getPath('appData'), 'omega-notes-dev'));
app.setName('Ômega Notes');
app.setAppUserModelId('com.omegastudy.app');
if (process.platform === 'linux') app.setDesktopName('com.omegastudy.app.desktop');
export let desktopReady;
let window;
let tray;
let backend;
let quitting = false;
let shutdown;
let trayRunning = false;
let trayMusicPlaying = false;
let trayLabels = { show: 'Show', hide: 'Hide', start: 'Start timer', pause: 'Pause timer', reset: 'Reset timer', musicPlay: 'Play music', musicPause: 'Pause music', musicNext: 'Next station', update: 'Update', exit: 'Exit' };
const emit = (event, payload) => { if (window && !window.isDestroyed()) window.webContents.send('omega:event', event, payload); };
const show = () => { if (window.isMinimized()) window.restore(); window.show(); window.focus(); refreshTray(); };
const hide = () => { if (tray) window.hide(); else window.minimize(); refreshTray(); };
function refreshTray() {
    if (!tray || !window || window.isDestroyed()) return;
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: window.isVisible() ? trayLabels.hide : trayLabels.show, click: () => window.isVisible() ? hide() : show() },
        { type: 'separator' },
        { label: trayRunning ? trayLabels.pause : trayLabels.start, click: () => emit('omega-tray-action', 'pomodoro-toggle') },
        { label: trayLabels.reset, click: () => emit('omega-tray-action', 'pomodoro-reset') },
        { type: 'separator' },
        { label: trayMusicPlaying ? trayLabels.musicPause : trayLabels.musicPlay, click: () => emit('omega-tray-action', 'music-play-pause') },
        { label: trayLabels.musicNext, click: () => emit('omega-tray-action', 'music-next') },
        { type: 'separator' },
        { label: trayLabels.update, click: () => { show(); emit('omega-tray-action', 'update'); } },
        { type: 'separator' },
        { label: trayLabels.exit, click: () => { show(); emit('omega-tray-action', 'exit'); } },
    ]));
}
export function quit() {
    if (shutdown) return shutdown;
    quitting = true;
    shutdown = (async () => {
        await backend?.stop();
        tray?.destroy();
        app.exit(0);
    })();
    return shutdown;
}
function validateSender(event) {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
    const current = new URL(event.senderFrame.url);
    const expected = new URL(devUrl || pathToFileURL(join(desktop, 'frontend/dist/index.html')).href);
    if (current.origin !== expected.origin || current.pathname !== expected.pathname) throw new Error('Untrusted IPC origin');
}
function isTrustedMainFrame(contents, requestingUrl, isMainFrame) {
    if (!window || contents !== window.webContents || !isMainFrame || typeof requestingUrl !== 'string') return false;
    try {
        const current = new URL(requestingUrl);
        const expected = new URL(devUrl || pathToFileURL(join(desktop, 'frontend/dist/index.html')).href);
        return current.origin === expected.origin && current.pathname === expected.pathname;
    } catch { return false; }
}
async function invoke(command, args) {
    switch (command) {
        case 'storage_import_snapshot': return settingsImport;
        case 'storage_import_complete': settingsImport = null; return;
        case 'storage_import_backup': {
            if (!settingsImport) throw new Error('No settings import requested');
            const snapshot = validateStorageSnapshot(args.snapshot);
            await mkdir(app.getPath('userData'), { recursive: true });
            await writeFile(join(app.getPath('userData'), `settings-backup-${Date.now()}.json`), JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
            return;
        }
        case 'window_is_maximized': return window.isMaximized();
        case 'window_toggle_maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); return;
        case 'window_minimize': window.minimize(); return;
        case 'window_close': window.close(); return;
        case 'window_destroy': return quit();
        case 'hide_main_window': hide(); return;
        case 'show_main_window': show(); return;
        case 'exit_main_app': return quit();
        case 'is_gnome_desktop': return process.platform === 'linux' && /(^|:)gnome(?:-|:|$)/i.test(process.env.XDG_CURRENT_DESKTOP || '');
        case 'set_window_background_color':
            if (typeof args.color !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(args.color)) throw new Error('Invalid window color');
            window.setBackgroundColor(args.color); return;
        case 'configure_tray_menu':
            if (!args.labels || Object.keys(trayLabels).some(key => typeof args.labels[key] !== 'string' || !args.labels[key].trim() || args.labels[key].length > 160) || typeof args.pomodoroRunning !== 'boolean' || typeof args.musicPlaying !== 'boolean') throw new Error('Invalid tray configuration');
            trayLabels = args.labels; trayRunning = args.pomodoroRunning; trayMusicPlaying = args.musicPlaying; refreshTray(); return;
        case 'dialog_confirm': {
            if (typeof args.message !== 'string' || args.message.length > 32_000) throw new Error('Invalid dialog message');
            const options = args.options || {};
            const result = await dialog.showMessageBox(window, { type: options.kind === 'error' ? 'error' : options.kind === 'warning' ? 'warning' : 'question', title: String(options.title || 'Ômega Notes'), message: args.message, buttons: [String(options.okLabel || 'OK'), String(options.cancelLabel || 'Cancel')], defaultId: 0, cancelId: 1, noLink: true });
            return result.response === 0;
        }
        case 'dialog_open': {
            const options = args.options || {};
            const filters = Array.isArray(options.filters) ? options.filters.filter(filter => typeof filter.name === 'string' && Array.isArray(filter.extensions) && filter.extensions.every(extension => typeof extension === 'string' && /^\w+$/.test(extension))) : undefined;
            const result = await dialog.showOpenDialog(window, { title: typeof options.title === 'string' ? options.title : undefined, properties: [options.directory ? 'openDirectory' : 'openFile', ...(options.multiple ? ['multiSelections'] : [])], filters });
            return result.canceled ? null : options.multiple ? result.filePaths : result.filePaths[0];
        }
        case 'open_url': {
            if (typeof args.url !== 'string' || args.url.length > 16_384) throw new Error('Invalid external URL');
            const url = new URL(args.url);
            if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported external URL');
            await shell.openExternal(url.href); return;
        }
        case 'updater_ready': return app.isPackaged && await backend.invoke(command, args);
        case 'updater_install': {
            if (!app.isPackaged) throw new Error('Updates require a packaged app');
            await installAndRelaunch(
                () => backend.invoke(command, args),
                () => app.relaunch(),
                quit,
            );
            return;
        }
        default:
            if (!commands.has(command)) throw new Error('Unknown desktop command');
            return backend.invoke(command, args);
    }
}

if (!app.requestSingleInstanceLock()) app.exit(0);
else {
    app.on('second-instance', () => { if (window) show(); });
    app.on('before-quit', event => {
        if (quitting) return;
        event.preventDefault();
        if (window) { show(); emit('omega-tray-action', 'exit'); }
    });
    app.on('activate', () => { if (window) show(); });
    app.on('window-all-closed', () => { void quit(); });
    if (process.platform === 'linux') process.once('SIGTERM', () => {
        if (window && !window.isDestroyed()) app.quit();
        else void quit();
    });
    desktopReady = app.whenReady().then(async () => {
    const executable = app.isPackaged ? join(process.resourcesPath, 'bin', `omega-notes-backend${process.platform === 'win32' ? '.exe' : ''}`) : join(desktop, 'backend/target/debug', `omega-notes-backend${process.platform === 'win32' ? '.exe' : ''}`);
    backend = new Backend(executable, ['--documents-dir', development && process.env.OMEGA_DEV_DOCUMENTS || app.getPath('documents'), '--cache-dir', join(app.getPath('userData'), 'cache')], message => {
        if (message.event) emit(message.event, message.payload);
        else if (window && !window.isDestroyed()) window.webContents.send('omega:channel', message.channel, message.payload);
    }, error => { if (!quitting && window) dialog.showErrorBox('Ômega Notes', `O backend encerrou. Copie qualquer texto não salvo antes de reabrir o aplicativo.\n\n${error.message}`); });
    try {
        await backend.ready();
        const icon = nativeImage.createFromPath(join(directory, 'icons/128x128.png'));
        window = new BrowserWindow({ width: 1000, height: 700, minWidth: 900, minHeight: 700, title: 'Ômega', frame: false, show: false, backgroundColor: '#141416', icon, webPreferences: { preload: join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
        Menu.setApplicationMenu(null);
        ipcMain.handle('omega:invoke', (event, command, args = {}) => {
            validateSender(event);
            if (typeof command !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid desktop request');
            return invoke(command, args);
        });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', event => event.preventDefault());
        window.webContents.on('will-attach-webview', event => event.preventDefault());
        window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(
            contents === window.webContents && (
                permission === 'clipboard-sanitized-write' ||
                permission === 'fullscreen' && isTrustedMainFrame(contents, details.requestingUrl, details.isMainFrame)
            )
        ));
        window.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) =>
            contents === window.webContents && (
                permission === 'clipboard-sanitized-write' ||
                permission === 'fullscreen' && isTrustedMainFrame(contents, details.requestingUrl, details.isMainFrame)
            )
        );
        window.on('resize', () => emit('window-resized', null));
        window.on('maximize', () => emit('window-resized', null));
        window.on('unmaximize', () => emit('window-resized', null));
        window.on('close', event => { if (!quitting) { event.preventDefault(); emit('window-close-requested', null); } });
        try {
            tray = new Tray(icon); tray.setToolTip('Ômega Notes');
            tray.on('click', () => window.isVisible() ? hide() : show()); refreshTray();
        } catch (error) { console.error('Tray unavailable:', error); }
        window.once('ready-to-show', () => show());
        if (devUrl) await window.loadURL(devUrl); else await window.loadFile(join(desktop, 'frontend/dist/index.html'));
        await unlink(join(app.getPath('userData'), 'updates/omega-notes-update.exe')).catch(() => {});
        return window;
    } catch (error) {
        dialog.showErrorBox('Ômega Notes', String(error));
        await quit();
    }
    });
}
