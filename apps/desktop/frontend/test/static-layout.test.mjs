import assert from 'node:assert/strict';
import test from 'node:test';
import { separateStaticNodes } from '../src/pages/canvas/lib/static-layout.ts';

test('locked notes stay fixed and overlapping unlocked notes move around them', () => {
	const positions = { movable: { x: 0, y: 0 }, locked: { x: 0, y: 0 } };
	const nodes = [{ id: 'movable', width: 80, height: 40 }, { id: 'locked', width: 80, height: 40 }];
	const next = separateStaticNodes(positions, nodes, new Set(['movable']), new Set(['locked']));

	assert.deepEqual(next.locked, positions.locked);
	assert.notDeepEqual(next.movable, positions.movable);
	assert.deepEqual(positions.movable, { x: 0, y: 0 });
});

test('overlapping locked notes keep both original positions', () => {
	const positions = { first: { x: 0, y: 0 }, second: { x: 0, y: 0 } };
	const nodes = [{ id: 'first', width: 80, height: 40 }, { id: 'second', width: 80, height: 40 }];

	assert.equal(separateStaticNodes(positions, nodes, new Set(), new Set(['first', 'second'])), positions);
});
