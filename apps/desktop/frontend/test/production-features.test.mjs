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

test('Archive layout is selectable and rendered in production', async () => {
	const settings = await source('../src/features/change-preferences/ui/settings-dialog/index.tsx');
	const canvas = await source('../src/pages/canvas/ui/canvas/index.tsx');
	assert.match(settings, /\{ value: "archive", label: props\.t\("archiveCanvas"\) \}/);
	assert.doesNotMatch(settings, /import\.meta\.env\.DEV/);
	assert.match(canvas, /<Match when=\{props\.layout === "archive"\}>/);
	assert.doesNotMatch(canvas, /import\.meta\.env\.DEV/);
});
