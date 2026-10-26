import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('Pomodoro entry point and panel are available in production', async () => {
	const titlebar = await source('../src/app/ui/window-titlebar/index.tsx');
	const app = await source('../src/app/index.tsx');
	assert.match(titlebar, /aria-label=\{props\.t\("pomodoroOpen"\)\}/);
	assert.doesNotMatch(titlebar, /import\.meta\.env\.DEV/);
	assert.match(app, /<Show when=\{pomodoroMounted\(\)\}>[\s\S]*?<PomodoroPanel/);
	assert.doesNotMatch(app, /import\.meta\.env\.DEV/);
});

test('Lo-fi radio controls remain in Pomodoro while its player lives for the app lifetime', async () => {
	const [titlebar, app, pomodoro, player] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/features/lofi-player/model/player.tsx'),
	]);
	assert.ok(pomodoro.indexOf('<LofiPlayerPanel') < pomodoro.indexOf('<section class={styles.timer}'));
	assert.match(app, /const AppView: Component = \(\) => \{\s*const app = useAppController\(\)/);
	assert.match(app, /const App: Component = \(\) => <LofiPlayerProvider><AppView \/><\/LofiPlayerProvider>/);
	assert.match(player, /<audio/);
	assert.match(player, /onCleanup\(\(\) => \{[\s\S]*?audio\?\.pause\(\)/);
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \? 0 : volume\(\)/);
	assert.match(player, /audio\.volume = effectiveVolume\(\)/);
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
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \? 0 : volume\(\)/);
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

test('Archive layout is selectable and rendered in production', async () => {
	const settings = await source('../src/features/change-preferences/ui/settings-dialog/index.tsx');
	const canvas = await source('../src/pages/canvas/ui/canvas/index.tsx');
	assert.match(settings, /\{ value: "archive", label: props\.t\("archiveCanvas"\) \}/);
	assert.doesNotMatch(settings, /import\.meta\.env\.DEV/);
	assert.match(canvas, /<Match when=\{props\.layout === "archive"\}>/);
	assert.doesNotMatch(canvas, /import\.meta\.env\.DEV/);
});
