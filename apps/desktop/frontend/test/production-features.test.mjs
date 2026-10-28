import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('Pomodoro entry point and panel remain available in production', async () => {
	const titlebar = await source('../src/app/ui/window-titlebar/index.tsx');
	const app = await source('../src/app/index.tsx');
	assert.match(titlebar, /<Show when=\{import\.meta\.env\.DEV\}>[\s\S]*?<\/Show>\s*<Button class=\{cx\(styles\.button, styles\.pomodoroButton\)\}[\s\S]*?aria-label=\{props\.t\("pomodoroOpen"\)\}/);
	assert.match(app, /<Show when=\{pomodoroMounted\(\)\}>[\s\S]*?<PomodoroPanel/);
});

test('Pomodoro focus completion can reveal a hidden window on both desktop hosts', async () => {
	const [pomodoro, app, windowApi, electron, tauri] = await Promise.all([
		source('../src/features/pomodoro/model/controller.ts'),
		source('../src/app/controller.ts'),
		source('../src/app/api/window.repository.ts'),
		source('../../bridge/electron/main.mjs'),
		source('../src/shared/lib/desktop-tauri.ts'),
	]);
	assert.match(pomodoro, /endsFocusPhase\(phase\(\), snapshot\.phase\)\) onFocusPhaseEnd\?\.\(\)/);
	assert.match(app, /showMainWindowIfHidden\(\)/);
	assert.match(windowApi, /isDesktopRuntime\(\) && !\(await isMainWindowVisible\(\)\)\) await showMainWindow\(\)/);
	assert.match(electron, /case 'window_is_visible': return window\.isVisible\(\)/);
	assert.match(tauri, /case 'window_is_visible': return await webviewWindow\.isVisible\(\)/);
});

test('tray Exit saves before calling the native app exit command', async () => {
	const [controls, tauri] = await Promise.all([
		source('../src/app/model/window-controls.controller.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	const exit = controls.slice(controls.indexOf('const exit ='), controls.indexOf('\n\t};', controls.indexOf('const exit =')));
	assert.match(exit, /await beforeClose\(\)/);
	assert.match(exit, /await exitMainApp\(\)/);
	assert.doesNotMatch(exit, /if\s*\([^)]*beforeClose/);
	assert.doesNotMatch(exit, /confirmClose\(/);
	assert.doesNotMatch(exit, /showMainWindow\(\)|closeWindow\(\)/);
	assert.match(tauri, /fn exit_app\(app: AppHandle\)\s*\{\s*app\.exit\(0\)/);
});

test('tray clicks open only the context menu on Windows', async () => {
	const tauri = await source('../../bridge/tauri/src/main.rs');
	assert.match(tauri, /\.show_menu_on_left_click\(true\)/);
	assert.doesNotMatch(tauri, /on_tray_icon_event/);
	assert.doesNotMatch(tauri, /MouseButton|TrayIconEvent/);
});

test('Tauri updater relaunches after installing and registers the native restart command', async () => {
	const [updates, desktop, tauri] = await Promise.all([
		source('../src/features/check-for-updates/api/updates.repository.ts'),
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	assert.match(updates, /await candidate\.install\(\);\s*await invoke\('relaunch_app'\)/);
	assert.match(desktop, /case 'relaunch_app': return await tauriInvoke\('relaunch_app'\)/);
	assert.match(tauri, /fn relaunch_app\(app: AppHandle\)\s*\{\s*app\.restart\(\)/);
	assert.match(tauri, /generate_handler!\[[\s\S]*?relaunch_app/);
});

test('startup centering is labeled as camera centering and does not move notes', async () => {
	const [ptBr, en, graph] = await Promise.all([
		source('../lang/pt-br.json'),
		source('../lang/en.json'),
		source('../src/pages/canvas/ui/graph-canvas/controller.ts'),
	]);
	const centerCamera = graph.match(/if \(props\.centerOnMount\) \{([\s\S]*?)\n\t\t\}/)?.[1];
	assert.equal(JSON.parse(ptBr).centerCanvasOnLaunch, 'Centralizar câmera');
	assert.equal(JSON.parse(en).centerCanvasOnLaunch, 'Center camera on launch');
	assert.ok(centerCamera);
	assert.match(centerCamera, /setView\(/);
	assert.doesNotMatch(centerCamera, /setPositions\(/);
});

test('canvas mounts only after a successful full vault load', async () => {
	const app = await source('../src/app/index.tsx');
	assert.match(app, /ready=\{app\.notes\.hasLoadedVault\(\)\}/);
});

test('Kanban is hidden and cannot be opened in production', async () => {
	const [titlebar, app, controller] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/app/controller.ts'),
	]);
	assert.match(titlebar, /<Show when=\{import\.meta\.env\.DEV\}>[\s\S]*?kanbanButton/);
	assert.match(app, /createPresence\(\(\) => import\.meta\.env\.DEV && app\.kanban\.open\(\)/);
	assert.match(app, /<Show when=\{import\.meta\.env\.DEV && kanbanMounted\(\)\}>[\s\S]*?<KanbanPanel/);
	assert.match(controller, /if \(!import\.meta\.env\.DEV \|\| !vaults\.activeVaultId\(\)\) return/);
	assert.match(controller, /if \(!import\.meta\.env\.DEV \|\| event\.defaultPrevented[\s\S]*?KeyB/);
});

test('Electron and Tauri enforce one app instance and focus the existing window', async () => {
	const [electron, tauri, tauriCargo] = await Promise.all([
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/tauri/src/main.rs'),
		source('../../bridge/tauri/Cargo.toml'),
	]);
	assert.match(electron, /if \(!app\.requestSingleInstanceLock\(\)\) app\.exit\(0\)/);
	assert.ok(electron.indexOf('if (!app.requestSingleInstanceLock())') < electron.indexOf('tray = new Tray(icon)'));
	assert.match(electron, /app\.on\('second-instance', \(\) => \{ if \(window\) show\(\); \}\)/);
	assert.match(tauriCargo, /tauri-plugin-single-instance = "2"/);
	assert.ok(tauri.indexOf('.plugin(tauri_plugin_single_instance::init(') < tauri.indexOf('.plugin(tauri_plugin_dialog::init())'));
	assert.match(tauri, /tauri_plugin_single_instance::init\(\|app, _args, _cwd\|\s*\{\s*show_window\(app\)\s*\}\)/);
});

test('Kanban card editor has only an icon save action', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	const start = kanban.indexOf('<form class={styles.cardEditor}');
	const editor = kanban.slice(start, kanban.indexOf('</form>', start));
	assert.doesNotMatch(editor, /props\.t\("cancel"\)|props\.t\("save"\)/);
	assert.match(editor, /type="submit"[\s\S]*?<Icon name="check" size=\{14\} \/>/);
});

test('static note locks are exposed and excluded from dragging and auto-separation', async () => {
	const [canvas, controller, style] = await Promise.all([
		source('../src/pages/canvas/ui/graph-canvas/index.tsx'),
		source('../src/pages/canvas/ui/graph-canvas/controller.ts'),
		source('../src/pages/canvas/ui/graph-canvas/style.css.ts'),
	]);
	assert.match(canvas, /graph\.toggleNoteLock\(current\.id\)/);
	assert.match(canvas, /graph\.areLockTargetsLocked\(menu\(\)\.noteId\)/);
	assert.match(canvas, /styles\.lockedBubble/);
	assert.doesNotMatch(canvas, /lockBadge/);
	assert.match(style, /lockedBubble: style\(\{[\s\S]*?borderColor: "var\(--ink\)"/);
	assert.match(controller, /if \(isLocked\(note\.id\)\) \{ setSelectedIds\(new Set\(\[note\.id\]\)\); return; \}/);
	assert.match(controller, /separateStaticNodes\(next, layoutNodes\(\), priority, new Set\(lockedNoteIds\(\)\)\)/);
});

test('Lo-fi radio controls remain in Pomodoro while its player lives for the app lifetime', async () => {
	const [titlebar, app, pomodoro, player, controller] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/features/lofi-player/model/player.tsx'),
		source('../src/app/controller.ts'),
	]);
	assert.ok(pomodoro.indexOf('<LofiPlayerPanel') < pomodoro.indexOf('<section class={styles.timer}'));
	assert.match(app, /const AppView: Component = \(\) => \{\s*const app = useAppController\(\)/);
	assert.match(app, /const App: Component = \(\) => <LofiPlayerProvider><AppView \/><\/LofiPlayerProvider>/);
	assert.match(player, /<audio/);
	assert.match(player, /onCleanup\(\(\) => \{[\s\S]*?cancelAudio\(\)/);
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \|\| pomodoroMuted\(\) \? 0 : volume\(\)/);
	assert.match(player, /audio\.volume = effectiveVolume\(\)/);
	assert.match(controller, /lofiPlayer\.setPomodoroMuted\(pomodoro\.muteLofi\(\)\)/);
	assert.doesNotMatch(app, /MusicPlayerPanel|musicOpen|onMusic/);
	assert.doesNotMatch(titlebar, /musicPlayerOpen|musicButton|onMusic/);
});

test('tray menu presents Play/Pause while starting playback or toggling mute', async () => {
	const [tray, controller, player, electron, tauri, tauriBridge, pt, en] = await Promise.all([
		source('../src/app/api/tray.repository.ts'),
		source('../src/app/controller.ts'),
		source('../src/features/lofi-player/model/player.tsx'),
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/tauri/src/main.rs'),
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../lang/pt-br.json').then(JSON.parse),
		source('../lang/en.json').then(JSON.parse),
	]);
	assert.match(tray, /"music-play-pause" \| "music-next"/);
	assert.match(controller, /if \(lofiPlayer\.isActive\(\)\) \{ lofiPlayer\.toggleMute\(\); return; \}/);
	assert.match(controller, /if \(lofiPlayer\.muted\(\)\) lofiPlayer\.toggleMute\(\);\s*lofiPlayer\.togglePlayback\(\)/);
	assert.match(controller, /case "music-play-pause": toggleTrayMusic\(\)/);
	assert.match(controller, /case "music-next": lofiPlayer\.nextSource\(\)/);
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \|\| pomodoroMuted\(\) \? 0 : volume\(\)/);
	assert.match(electron, /trayMusicPlaying \? trayLabels\.musicPause : trayLabels\.musicPlay/);
	assert.match(electron, /'music-play-pause'/);
	assert.match(electron, /'music-next'/);
	assert.match(tauri, /music_playing/);
	assert.match(tauri, /labels\.music_pause[\s\S]*labels\.music_play/);
	assert.match(tauri, /"music-play-pause" => emit_tray_action\(app, "music-play-pause"\)/);
	assert.match(tauri, /"music-next"/);
	assert.match(tauriBridge, /musicPlaying: args\.musicPlaying/);
	assert.equal(pt.musicPlayerPlay, 'Reproduzir música');
	assert.equal(pt.musicPlayerPause, 'Pausar música');
	assert.equal(en.musicPlayerPlay, 'Play music');
	assert.equal(en.musicPlayerPause, 'Pause music');
	assert.doesNotMatch([tray, controller, electron, tauri, tauriBridge].join(''), /music-toggle-mute|musicMuted|musicMute|musicUnmute/);
	assert.equal(pt.trayPomodoroStart, 'Iniciar relógio');
	assert.equal(pt.trayPomodoroPause, 'Pausar relógio');
	assert.equal(pt.trayPomodoroReset, 'Reiniciar relógio');
	assert.equal(en.trayPomodoroStart, 'Start timer');
	assert.equal(en.trayPomodoroReset, 'Reset timer');
	assert.doesNotMatch(tray, /pomodoro-next/);
	assert.doesNotMatch(electron, /trayLabels\.next|pomodoro-next/);
	assert.doesNotMatch(tauri, /"next" => emit_tray_action\(app, "pomodoro-next"\)/);
});

test('Pomodoro settings overlay the timer without changing its layout', async () => {
	const [pomodoro, styles] = await Promise.all([
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/features/pomodoro/ui/pomodoro-panel/style.css.ts'),
	]);
	assert.ok(pomodoro.indexOf('<section class={styles.timer}') < pomodoro.indexOf('<div class={styles.settingsOverlay}'));
	assert.ok(pomodoro.indexOf('<div class={styles.settingsOverlay}') < pomodoro.indexOf('<div class={styles.clock}'));
	assert.match(styles, /timer: style\(\{ position: "relative"/);
	assert.match(styles, /settingsOverlay: style\(\{ position: "absolute"[^}]*zIndex: 2/);
	assert.equal((pomodoro.match(/onChange=\{saveSettings\}/g) ?? []).length, 4);
	const settingsStart = pomodoro.indexOf('<div class={styles.settingsForm}>');
	const settingsForm = pomodoro.slice(settingsStart, pomodoro.indexOf('</div>', settingsStart));
	assert.doesNotMatch(settingsForm, /<Button|type="submit"|props\.t\("save"\)/);
	assert.match(pomodoro, /if \(showSettings\(\) && \(/);
	assert.match(pomodoro, /Icon name=\{props\.pomodoro\.running\(\) \? "pause" : "play"\}/);
	assert.match(pomodoro, /size=\{16\} \/>\s*<\/Button>\s*<Show when=\{props\.pomodoro\.timerReady\(\) && props\.pomodoro\.seconds\(\) !== props\.pomodoro\.phaseSeconds\(\)\}/);
	assert.match(pomodoro, /<Icon name="reset" size=\{14\} \/>/);
	assert.match(styles, /primaryButton: style\(\[button, \{ boxSizing: "border-box", width: 64, minWidth: 64, height: 32, minHeight: 32/);
	assert.match(styles, /resetButton: style\(\[button, \{ position: "absolute", top: "50%", left: "calc\(50% \+ 38px\)"[^}]*width: 36, minWidth: 36, height: 32, minHeight: 32/);
});

test('Archive canvas layout is no longer selectable or rendered', async () => {
	const settings = await source('../src/features/change-preferences/ui/settings-dialog/index.tsx');
	const canvas = await source('../src/pages/canvas/ui/canvas/index.tsx');
	assert.doesNotMatch(settings, /value:\s*"archive"|archiveCanvas/);
	assert.doesNotMatch(canvas, /archive-view|layout\s*===\s*"archive"/);
	assert.match(canvas, /GraphCanvas/);
});
