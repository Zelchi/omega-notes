import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dynamicTrayLabels, trayIconVariant } from '../tray-menu.mjs';

const labels = {
	show: 'Show', hide: 'Hide', start: 'Start', pause: 'Pause',
	musicPlay: 'Play music', musicPause: 'Pause music',
};

test('Electron tray labels track visibility and playback state', () => {
	assert.deepEqual(dynamicTrayLabels(labels, { visible: false, pomodoroRunning: false, musicPlaying: false }), {
		visibility: 'Show', pomodoro: 'Start', music: 'Play music',
	});
	assert.deepEqual(dynamicTrayLabels(labels, { visible: true, pomodoroRunning: true, musicPlaying: true }), {
		visibility: 'Hide', pomodoro: 'Pause', music: 'Pause music',
	});
});

test('Electron tray icon color tracks music and Pomodoro independently', () => {
	assert.equal(trayIconVariant({ pomodoroRunning: false, musicPlaying: false }), 'idle');
	assert.equal(trayIconVariant({ pomodoroRunning: false, musicPlaying: true }), 'music');
	assert.equal(trayIconVariant({ pomodoroRunning: true, musicPlaying: false }), 'pomodoro');
	assert.equal(trayIconVariant({ pomodoroRunning: true, musicPlaying: true }), 'both');
});

test('Electron refreshes tray labels after app-driven show and hide', async () => {
	const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
	assert.match(main, /const show = \(\) => \{[\s\S]*?refreshTray\(\); \};/);
	assert.match(main, /const hide = \(\) => \{[\s\S]*?refreshTray\(\); \};/);
	assert.match(main, /case 'configure_tray_menu':[\s\S]*?refreshTray\(\); return;/);
	assert.match(main, /tray\.setImage\(trayIcons\[nextTrayIconState\]\)/);
	assert.match(main, /icon: windowIcon/);
});
