import assert from 'node:assert/strict';
import test from 'node:test';
import { observePdfHighlightMenuDismissal } from '../src/features/manage-pdfs/model/highlight-menu-dismissal.ts';

const createEventTarget = () => {
	const listeners = new Map();
	return {
		addEventListener: (type, listener, options) => listeners.set(`${type}:${options === true}`, listener),
		removeEventListener: (type, listener, options) => {
			const key = `${type}:${options === true}`;
			if (listeners.get(key) === listener) listeners.delete(key);
		},
		emit: (type, event = {}, capture = false) => listeners.get(`${type}:${capture}`)?.(event),
		has: (type, capture = false) => listeners.has(`${type}:${capture}`),
	};
};

test('outside pointer presses close the menu but presses inside the menu or suggestion list do not', () => {
	const windowTarget = createEventTarget();
	const menu = {};
	const suggestions = {};
	let closed = 0;
	observePdfHighlightMenuDismissal({
		windowTarget,
		isInsideMenu: target => target === menu || target === suggestions,
		isSuggestionInput: () => false,
		suggestionsOpen: () => false,
		closeMenu: () => { closed += 1; },
	});

	windowTarget.emit('pointerdown', { target: menu });
	windowTarget.emit('pointerdown', { target: suggestions });
	assert.equal(closed, 0);
	windowTarget.emit('pointerdown', { target: {} });
	assert.equal(closed, 1);
});

test('Escape is left to open note suggestions, otherwise it prevents propagation and closes the menu', () => {
	const windowTarget = createEventTarget();
	const suggestionInput = {};
	let suggestionsOpen = true;
	let closed = 0;
	let prevented = 0;
	let stopped = 0;
	observePdfHighlightMenuDismissal({
		windowTarget,
		isInsideMenu: () => false,
		isSuggestionInput: target => target === suggestionInput,
		suggestionsOpen: () => suggestionsOpen,
		closeMenu: () => { closed += 1; },
	});

	windowTarget.emit('keydown', {
		key: 'Escape',
		target: suggestionInput,
		preventDefault: () => { prevented += 1; },
		stopImmediatePropagation: () => { stopped += 1; },
	}, true);
	assert.deepEqual([closed, prevented, stopped], [0, 0, 0]);

	windowTarget.emit('keydown', {
		key: 'Enter',
		target: {},
		preventDefault: () => { prevented += 1; },
		stopImmediatePropagation: () => { stopped += 1; },
	}, true);
	assert.deepEqual([closed, prevented, stopped], [0, 0, 0]);

	suggestionsOpen = false;
	windowTarget.emit('keydown', {
		key: 'Escape',
		target: suggestionInput,
		preventDefault: () => { prevented += 1; },
		stopImmediatePropagation: () => { stopped += 1; },
	}, true);
	assert.deepEqual([closed, prevented, stopped], [1, 1, 1]);
});

test('stopping dismissal observation removes both listeners idempotently', () => {
	const windowTarget = createEventTarget();
	let closed = 0;
	const stop = observePdfHighlightMenuDismissal({
		windowTarget,
		isInsideMenu: () => false,
		isSuggestionInput: () => false,
		suggestionsOpen: () => false,
		closeMenu: () => { closed += 1; },
	});

	assert.equal(windowTarget.has('pointerdown'), true);
	assert.equal(windowTarget.has('keydown', true), true);
	stop();
	stop();
	assert.equal(windowTarget.has('pointerdown'), false);
	assert.equal(windowTarget.has('keydown', true), false);
	windowTarget.emit('pointerdown');
	assert.equal(closed, 0);
});
