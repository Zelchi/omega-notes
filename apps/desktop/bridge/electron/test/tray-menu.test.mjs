import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dynamicTrayLabels } from '../tray-menu.mjs';

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

test('Electron refreshes tray labels after app-driven show and hide', async () => {
	const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
	assert.match(main, /const show = \(\) => \{[\s\S]*?refreshTray\(\); \};/);
	assert.match(main, /const hide = \(\) => \{[\s\S]*?refreshTray\(\); \};/);
	assert.match(main, /case 'configure_tray_menu':[\s\S]*?refreshTray\(\); return;/);
});
