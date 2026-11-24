import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getBackgroundDensityLimit, getMatrixRainPosition, isBackgroundMarkVisible,
} from '../src/shared/ui/ascii-backdrop/rendering.ts';

test('matrix rain converts global viewport coordinates into host-local canvas coordinates', () => {
	assert.deepEqual(getMatrixRainPosition(
		25,
		100,
		1000,
		800,
		1,
		4,
		{ left: 120, top: 30 },
	), { x: 130, y: 158 });
});

test('background intensity limit includes only marks below the density boundary', () => {
	assert.equal(getBackgroundDensityLimit(0.5, 0.04), 0.02);
	assert.equal(getBackgroundDensityLimit(0.5), 0.5);
	assert.equal(isBackgroundMarkVisible(0.49, 0.5), true);
	assert.equal(isBackgroundMarkVisible(0.5, 0.5), false);
	assert.equal(isBackgroundMarkVisible(0.8, 0.5), false);
});
