import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async path => (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');

test('Pomodoro and Kanban entry points and panels remain available in production', async () => {
	const titlebar = await source('../src/app/ui/window-titlebar/index.tsx');
	const app = await source('../src/app/index.tsx');
	assert.match(titlebar, /<Button class=\{cx\(styles\.button, styles\.kanbanButton\)\}[\s\S]*?aria-label=\{props\.t\("kanbanOpen"\)\}/);
	assert.match(titlebar, /<Button class=\{cx\(styles\.button, styles\.pomodoroButton\)\}[\s\S]*?aria-label=\{props\.t\("pomodoroOpen"\)\}/);
	assert.match(app, /<Show when=\{pomodoroMounted\(\)\}>[\s\S]*?<PomodoroPanel/);
	assert.match(app, /<Show when=\{kanbanMounted\(\)\}>[\s\S]*?<KanbanPanel/);
});

test('Vault switcher occupies the titlebar center track instead of overlapping drag regions', async () => {
	const styles = await source('../src/app/ui/window-titlebar/style.css.ts');
	assert.match(styles, /vaultName: style\(\{[\s\S]*?gridColumn: 2,[\s\S]*?justifySelf: "center"/);
	assert.doesNotMatch(styles, /vaultName: style\(\{\s*position: "absolute"/);
});

test('Shift-clicking Pomodoro Play starts the timer and hides the main window', async () => {
	const [panel, app] = await Promise.all([
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/app/index.tsx'),
	]);
	assert.match(panel, /const toggleTimer = \(event: MouseEvent\): void => \{\s*if \(props\.pomodoro\.running\(\)\) \{\s*props\.pomodoro\.pause\(\);\s*return;\s*\}\s*props\.pomodoro\.start\(\);\s*if \(event\.shiftKey\) props\.onHideWindow\(\);\s*\}/);
	assert.match(panel, /onClick=\{toggleTimer\}/);
	assert.match(app, /<PomodoroPanel pomodoro=\{app\.pomodoro\} t=\{app\.t\} onHideWindow=\{app\.windowControls\.close\} \/>/);
});

test('Pomodoro focus completion can reveal a hidden window on both desktop hosts', async () => {
	const [pomodoro, app, windowApi, electron, tauri] = await Promise.all([
		source('../src/features/pomodoro/model/controller.ts'),
		source('../src/app/controller.ts'),
		source('../src/app/api/window.repository.ts'),
		source('../../bridge/electron/main.mjs'),
		source('../src/shared/lib/desktop-tauri.ts'),
	]);
	assert.match(pomodoro, /playPhaseChange && phase\(\) !== snapshot\.phase\) \{\s*onPhaseEnd\?\.\(\)/);
	assert.match(app, /usePomodoro\(vaults\.activeVaultId, \(\) => \{\s*hideOtherWindows\("pomodoro"\);\s*pomodoro\.setOpen\(true\);\s*void showMainWindowIfHidden\(\)/);
	assert.match(windowApi, /isDesktopRuntime\(\) && !\(await isMainWindowVisible\(\)\)\) await showMainWindow\(\)/);
	assert.match(electron, /case 'window_is_visible': return window\.isVisible\(\)/);
	assert.match(tauri, /case 'window_is_visible': return await webviewWindow\.isVisible\(\)/);
});

test('Chat scroll position updates do not retrigger automatic follow-to-bottom', async () => {
	const chat = await source('../src/features/chat-with-ai/ui/ai-chat-panel/index.tsx');
	const scrollEffectStart = chat.indexOf('    createEffect(() => {\n        props.aiChat.chat().messages;');
	const scrollEffectEnd = chat.indexOf('\n    });', scrollEffectStart);
	const scrollEffect = chat.slice(scrollEffectStart, scrollEffectEnd);
	assert.ok(scrollEffectStart >= 0, 'chat scroll effect is present');
	assert.ok(scrollEffectEnd > scrollEffectStart, 'chat scroll effect has a closing boundary');
	assert.match(scrollEffect, /const view = untrack\(\(\) => props\.aiChat\.messageView\(\)\)/);
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

test('Linux and Windows tray Exit stay hidden and defer dispatch by 150ms', async () => {
	const [electron, tauri] = await Promise.all([
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	const exitClickStart = electron.indexOf('{ label: trayLabels.exit');
	const exitClick = electron.slice(exitClickStart, electron.indexOf('\n    ]));', exitClickStart));
	const quitStart = electron.indexOf('export function quit()');
	const quit = electron.slice(quitStart, electron.indexOf('\nfunction validateSender', quitStart));
	assert.match(exitClick, /if \(process\.platform === 'darwin'\) \{ show\(\); emit\('omega-tray-action', 'exit'\); \}\s*else setTimeout\(\(\) => emit\('omega-tray-action', 'exit'\), 150\)/);
	assert.match(quit, /Promise\.race\([\s\S]*?backend\.stop\(\)[\s\S]*?5000/);
	assert.match(quit, /process\.platform !== 'linux'[\s\S]*?tray\?\.destroy\(\)/);
	assert.match(quit, /app\.exit\(0\)/);
	const tauriExitStart = tauri.indexOf('"exit" => {');
	const tauriExit = tauri.slice(tauriExitStart, tauri.indexOf('\n                    _ => {}', tauriExitStart));
	assert.doesNotMatch(tauriExit, /show_window\(app\)/);
	assert.match(tauriExit, /std::thread::spawn[\s\S]*?sleep\(std::time::Duration::from_millis\(150\)\)[\s\S]*?emit_tray_action\(&app, "exit"\)/);
});

test('tray clicks open only the context menu on Windows', async () => {
	const tauri = await source('../../bridge/tauri/src/main.rs');
	assert.match(tauri, /\.show_menu_on_left_click\(true\)/);
	assert.doesNotMatch(tauri, /on_tray_icon_event/);
	assert.doesNotMatch(tauri, /MouseButton|TrayIconEvent/);
});

test('Tauri tray visibility follows every app-driven window show or hide', async () => {
	const [desktop, tauri] = await Promise.all([
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	assert.match(desktop, /case 'hide_main_window': return await tauriInvoke\('hide_main_window'\)/);
	assert.match(desktop, /case 'show_main_window': return await tauriInvoke\('show_main_window'\)/);
	assert.match(tauri, /fn set_window_visibility\([\s\S]*?refresh_tray_menu\(app\)/);
	assert.match(tauri, /fn hide_main_window\(app: AppHandle\) -> Result<\(\), String> \{\s*set_window_visibility\(&app, false\)/);
	assert.match(tauri, /fn show_main_window\(app: AppHandle\) -> Result<\(\), String> \{\s*set_window_visibility\(&app, true\)/);
	assert.match(tauri, /fn toggle_window_visibility\([\s\S]*?window\.is_visible\(\)[\s\S]*?set_window_visibility\(app, !visible\)/);
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

test('Pomodoro and Kanban shortcuts are configurable and Kanban is available in production', async () => {
	const [titlebar, app, controller, settings] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/app/controller.ts'),
		source('../src/features/change-preferences/ui/settings-dialog/index.tsx'),
	]);
	assert.doesNotMatch(titlebar, /import\.meta\.env\.DEV/);
	assert.match(titlebar, /aria-keyshortcuts=\{props\.kanbanShortcut\}/);
	assert.match(app, /createPresence\(app\.kanban\.open, 210\)/);
	assert.match(app, /<Show when=\{kanbanMounted\(\)\}>[\s\S]*?<KanbanPanel/);
	assert.match(controller, /const toggleKanban = \(\) => \{\s*if \(!vaults\.activeVaultId\(\)\) return/);
	assert.match(controller, /matchesKeyboardShortcut\(event, preferences\.pomodoroShortcut\(\)\)/);
	assert.match(controller, /matchesKeyboardShortcut\(event, preferences\.kanbanShortcut\(\)\)/);
	assert.match(settings, /value=\{props\.pomodoroShortcut\} onChange=\{props\.onPomodoroShortcutChange\}/);
	assert.match(settings, /value=\{props\.kanbanShortcut\} onChange=\{props\.onKanbanShortcutChange\}/);
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

test('Kanban card details link to notes instead of exposing a description', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /props\.t\("kanbanLinkedNote"\)/);
	assert.match(kanban, /props\.onCreateNote\(noteTitle\)/);
	assert.match(kanban, /props\.onOpenNote\(note\(\)\)/);
	assert.match(kanban, /<Dropdown ariaLabel=\{props\.t\("kanbanPriority"\)\} value=\{priorityDraft\(\)\} placeholder="—"/);
	assert.match(kanban, /options=\{kanbanPriorities\.filter\(priority => priority !== "none"\)\.map\(priority =>/);
	assert.match(kanban, /<Portal>/);
	assert.match(kanban, /<CustomScrollArea ariaLabel=\{props\.t\("kanbanLinkedNote"\)\}/);
	assert.match(kanban, /createBackdropDismiss\(closeDetails\)/);
	assert.match(kanban, /<Portal mount=\{document\.querySelector\("\[data-omega-app-shell\]"\) \?\? document\.body\}>/);
	assert.match(kanban, /<AsciiBackdrop placement="modal" \/>/);
	assert.match(kanban, /registerVisibilityAnimation\(element, detailPresence\.exiting, "dialog"\)/);
	assert.match(kanban, /role="dialog" aria-modal="true" aria-labelledby=\{detailHeadingId\}/);
	assert.match(kanban, /window\.addEventListener\("keydown", escape, true\)/);
	assert.doesNotMatch(kanban, /descriptionDraft|kanbanDescription|cardDescription/);
	assert.match(kanban, /props\.t\("kanbanPriority"\)/);
	assert.match(kanban, /type="date"/);
	assert.match(kanban, /props\.t\("kanbanLabels"\)/);
	assert.match(kanban, /onSubmit=\{event => void saveDetails\(event\)\}/);
});

test('temporary note preview activates only with the left Alt key', async () => {
	const preview = await source('../src/features/temporary-note-reading/model/temporary-reading.controller.ts');
	assert.match(preview, /event\.code === "AltLeft"/);
	assert.doesNotMatch(preview, /event\.key === "Alt"|event\.code === "AltRight"/);
	assert.match(preview, /else if \(leftAltDown && !\["Shift", "Meta"\]\.includes\(event\.key\)\)/);
});

test('single-column and expanded Kanban reserve extra space beside the overlay scrollbar', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /viewportStyle=\{\{ padding: layoutColumnCount\(\) === 1 \|\| layoutColumnCount\(\) === 5 \? "2px 24px 12px 12px" : "2px 12px 12px" \}\}/);
});

test('Kanban priority filter uses the shared dropdown component', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /import Dropdown from "@\/shared\/ui\/dropdown"/);
	assert.match(kanban, /<Dropdown ariaLabel=\{props\.t\("kanbanPriority"\)\} value=\{priorityFilter\(\)\}/);
	assert.match(kanban, /kanbanPriorities\.filter\(priority => priority !== "none"\)/);
	assert.match(kanban, /onChange=\{value => setPriorityFilter\(value as KanbanPriority \| "all"\)\}/);
});

test('Kanban WIP editor opens from the count and zero means unlimited', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /<Show when=\{wipEditorStatus\(\) === status\} fallback=\{[\s\S]*?<Button class=\{styles\.count\}/);
	assert.match(kanban, /<input class=\{styles\.wipInput\}[\s\S]*?onBlur=\{event => finishWipEditor\(status, event\.currentTarget\)\}/);
	assert.match(kanban, /document\.addEventListener\("pointerdown", commitWipEditorOutside, true\)/);
	assert.doesNotMatch(kanban, /styles\.wipEditor/);
	assert.doesNotMatch(kanban, /Icon name="sliders"/);
	assert.match(kanban, /type="number" min="0"/);
	assert.match(kanban, /value === 0 \? undefined : value/);
});

test('empty Kanban lanes do not show an empty-state message or placeholder', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.doesNotMatch(kanban, /kanbanEmpty|styles\.empty/);
});

test('multi-column Kanban lanes stretch to the available height', async () => {
	const style = await source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts');
	assert.match(style, /lanesFive: style\(\{ height: "100%", gridTemplateColumns: `repeat\(\$\{kanbanStatuses\.length\}, minmax\(0, 1fr\)\)`, alignContent: "stretch" \}\)/);
	assert.match(style, /lane: style\(\{\s*display: "grid",\s*alignContent: "start"/);
});

test('Kanban uses only a temporary drag insertion gap, not permanent empty slots', async () => {
	const [kanban, style] = await Promise.all([
		source('../src/features/manage-kanban/ui/kanban-panel/index.tsx'),
		source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts'),
	]);
	assert.doesNotMatch(kanban, /kanbanSlotCount|slotPositions|positionSlot/);
	assert.doesNotMatch(kanban, /draggedItem/);
	assert.match(kanban, /dropPlaceholder\(\)/);
	assert.match(kanban, /getDropPosition\(lane, clientY\)/);
	assert.match(kanban, /draggable=\{false\}/);
	assert.match(kanban, /onPointerDown=\{event => startDrag\(event, item\)\}/);
	assert.match(kanban, /window\.addEventListener\("pointermove", moveCardDrag, \{ capture: true, passive: false \}\)/);
	assert.match(kanban, /Math\.hypot\(event\.clientX - drag\.startX, event\.clientY - drag\.startY\) < 5/);
	assert.match(kanban, /drag\.source\.cloneNode\(true\)/);
	assert.match(kanban, /cardDrag\.preview\?\.remove\(\)/);
	assert.doesNotMatch(kanban, /onDragStart|onDragOver|onDrop|setDragImage|dataTransfer/);
	assert.match(kanban, /document\.documentElement\.classList\.toggle\(styles\.dragging, Boolean\(draggedId\(\)\)\)/);
	assert.match(kanban, /document\.documentElement\.classList\.remove\(styles\.dragging\)/);
	assert.match(style, /const dragging = style\(\{ cursor: "none" \}\)/);
	assert.match(style, /globalStyle\(`\$\{dragging\}, \$\{dragging\} \*`, \{ cursor: "none !important" \}\)/);
	assert.match(style, /dragPreview: style\(\{ position: "fixed", zIndex: 20, pointerEvents: "none", opacity: 0\.92/);
	assert.match(style, /draggedSource: style\(\{ position: "absolute"/);
	assert.match(style, /dropPlaceholder: style\(\{ boxSizing: "border-box", width: "100%", minHeight: 56, pointerEvents: "none" \}\)/);
	assert.match(kanban, /<Show when=\{item\.priority !== "none" \|\| item\.dueDate\}>/);
});

test('frontend globally suppresses browser default focus outlines', async () => {
	const css = await source('../src/index.css');
	assert.match(css, /\*:focus\s*\{\s*outline:\s*none;/);
});

test('clicking the right edge of a vault row selects it, with hover feedback', async () => {
	const [dialog, style] = await Promise.all([
		source('../src/features/manage-vault/ui/vault-dialog/index.tsx'),
		source('../src/features/manage-vault/ui/vault-dialog/style.css.ts'),
	]);
	assert.match(dialog, /const selectVault = \(vaultId: string\) => \{[\s\S]*?state\.setSelectedVaultId\(vaultId\);\s*\}/);
	assert.match(dialog, /if \(event\.target === event\.currentTarget\) selectVault\(vault\.id\)/);
	assert.match(dialog, /event\.stopPropagation\(\);\s*toggleVaultActions\(vault\.id\)/);
	assert.match(style, /vaultActionsHitArea: style\(\{ paddingRight: 6, marginRight: -5, cursor: "pointer" \}\)/);
	assert.match(style, /selectors: \{ "&:hover": \{ backgroundColor: "var\(--surface-hover\)" \} \}/);
	assert.match(style, /vaultActionsOpen: style\(\{ selectors: \{ "&::after": \{ content: "", position: "absolute", top: 0, right: 0, bottom: 0, width: 6, backgroundColor: "var\(--border-strong\)", pointerEvents: "none" \} \} \}\)/);
});

test('Kanban width transition remains active when window resizing moves it to another session', async () => {
	const [panel, style] = await Promise.all([
		source('../src/features/manage-kanban/ui/kanban-panel/index.tsx'),
		source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts'),
	]);
	assert.match(style, /transition: "width 100ms cubic-bezier\(0\.2, 0\.7, 0\.3, 1\)"/);
	assert.doesNotMatch(style, /panelWindowResizing|transition: "none"/);
	assert.doesNotMatch(panel, /windowResizing|panelWindowResizing/);
	assert.match(panel, /resizeKanbanPanelForViewport/);
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
	const [tray, controller, player, electron, electronTray, tauri, tauriBridge, pt, en] = await Promise.all([
		source('../src/app/api/tray.repository.ts'),
		source('../src/app/controller.ts'),
		source('../src/features/lofi-player/model/player.tsx'),
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/electron/tray-menu.mjs'),
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
	assert.match(electron, /musicPlaying: trayMusicPlaying/);
	assert.match(electronTray, /music: musicPlaying \? labels\.musicPause : labels\.musicPlay/);
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
	assert.doesNotMatch([tray, controller, electron, electronTray, tauri, tauriBridge].join(''), /music-toggle-mute|musicMuted|musicMute|musicUnmute/);
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
