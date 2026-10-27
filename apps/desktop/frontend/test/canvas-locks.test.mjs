import test from 'node:test';
import assert from 'node:assert/strict';
import { areNoteLockTargetsLocked, noteLockTargets, toggleNoteLocks } from '../src/pages/canvas/ui/graph-canvas/controller.ts';

test('locking a selected note targets the whole selection, otherwise only that note', () => {
	const selection = new Set(['a', 'b', 'c']);
	assert.deepEqual(noteLockTargets('b', selection), ['a', 'b', 'c']);
	assert.deepEqual(noteLockTargets('other', selection), ['other']);
});

test('a mixed selection locks together and an entirely locked selection unlocks together', () => {
	const targets = ['a', 'b', 'c'];
	assert.equal(areNoteLockTargetsLocked([], targets), false);
	assert.deepEqual(toggleNoteLocks(['other', 'a'], targets), ['other', 'a', 'b', 'c']);
	assert.equal(areNoteLockTargetsLocked(['a', 'b', 'c'], targets), true);
	assert.deepEqual(toggleNoteLocks(['other', 'a', 'b', 'c'], targets), ['other']);
});
