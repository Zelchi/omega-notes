import assert from 'node:assert/strict';
import test from 'node:test';
import { getCanvasStartupView } from '../src/pages/canvas/model/startup-view.ts';

test('canvas startup view centers the scaled note bounds in the viewport', () => {
	assert.deepEqual(getCanvasStartupView(
		{ width: 500, height: 400 },
		2,
		{ left: 10, top: 20, right: 110, bottom: 220 },
		{ width: 100, height: 80 },
	), { x: 130, y: -40, scale: 2 });
});

test('empty canvas startup view centers the home region without changing scale', () => {
	assert.deepEqual(getCanvasStartupView(
		{ width: 500, height: 400 },
		1.5,
		undefined,
		{ width: 100, height: 80 },
	), { x: 200, y: 160, scale: 1.5 });
});
