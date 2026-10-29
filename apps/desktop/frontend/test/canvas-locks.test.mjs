import test from 'node:test';
import assert from 'node:assert/strict';
import { areNoteLockTargetsLocked, noteLockTargets, toggleNoteLocks } from '../src/pages/canvas/ui/graph-canvas/controller.ts';
import { DEFAULT_NOTE_LOCK_SHORTCUT } from '../src/features/change-preferences/model/note-lock-shortcut.ts';
import { matchesCanvasLayoutShortcut } from '../src/features/change-preferences/model/canvas-layout-shortcut.ts';

const keyEvent = (overrides = {}) => ({
	code: 'KeyL', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false,
	defaultPrevented: false, isComposing: false, target: null,
	getModifierState: name => name === 'AltGraph' ? false : false,
	...overrides,
});

test('note lock hotkey defaults to Ctrl+Shift+L and requires an exact modifier match', t => {
	const previousElement = globalThis.Element;
	globalThis.Element = class Element {};
	t.after(() => {
		if (previousElement === undefined) delete globalThis.Element;
		else globalThis.Element = previousElement;
	});
	assert.deepEqual(DEFAULT_NOTE_LOCK_SHORTCUT, { code: 'KeyL', ctrl: true, alt: false, shift: true });
	assert.equal(matchesCanvasLayoutShortcut(keyEvent(), DEFAULT_NOTE_LOCK_SHORTCUT), true);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ shiftKey: false }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ altKey: true }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ metaKey: true }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ defaultPrevented: true }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ isComposing: true }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
	assert.equal(matchesCanvasLayoutShortcut(keyEvent({ getModifierState: () => true }), DEFAULT_NOTE_LOCK_SHORTCUT), false);
});

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
	assert.equal(areNoteLockTargetsLocked([], []), false);
	assert.deepEqual(toggleNoteLocks(['other'], []), ['other']);
});
