import assert from 'node:assert/strict';
import test from 'node:test';
import { getKanbanDropPosition, hasKanbanDragThreshold } from '../src/features/manage-kanban/model/card-drag.ts';
import { installKanbanCardDragListeners } from '../src/features/manage-kanban/model/card-drag-listeners.ts';

test('Kanban card drag starts only when pointer movement reaches five pixels', () => {
	assert.equal(hasKanbanDragThreshold(10, 10, 13, 13), false);
	assert.equal(hasKanbanDragThreshold(10, 10, 13, 14), true);
	assert.equal(hasKanbanDragThreshold(10, 10, 10, 15), true);
});

test('Kanban drop position uses card midpoints and clamps to the lane ends', () => {
	const cards = [
		{ top: 10, height: 20 },
		{ top: 40, height: 20 },
		{ top: 70, height: 20 },
	];
	const getPosition = clientY => getKanbanDropPosition(cards, clientY, card => card);

	assert.equal(getPosition(9), 0);
	assert.equal(getPosition(19), 0);
	assert.equal(getPosition(20), 1);
	assert.equal(getPosition(50), 2);
	assert.equal(getPosition(100), 3);
	assert.equal(getKanbanDropPosition([], 50, () => assert.fail('no card bounds should be read')), 0);
});

test('Kanban card drag listeners forward pointer events and remove capture listeners once', () => {
	const calls = [];
	const listeners = new Map();
	const target = {
		addEventListener: (type, listener, options) => {
			calls.push(['add', type, options]);
			listeners.set(type, listener);
		},
		removeEventListener: (type, listener, options) => calls.push(['remove', type, options, listeners.get(type) === listener]),
	};
	const dispatched = [];
	const stop = installKanbanCardDragListeners({
		move: event => dispatched.push(['move', event]),
		up: event => dispatched.push(['up', event]),
		cancel: event => dispatched.push(['cancel', event]),
		blur: () => dispatched.push(['blur']),
	}, target);

	const event = { pointerId: 7 };
	listeners.get('pointermove')(event);
	listeners.get('pointerup')(event);
	listeners.get('pointercancel')(event);
	listeners.get('blur')();
	assert.deepEqual(dispatched, [
		['move', event],
		['up', event],
		['cancel', event],
		['blur'],
	]);
	assert.deepEqual(calls.slice(0, 4).map(([, type, options]) => [type, options]), [
		['pointermove', { capture: true, passive: false }],
		['pointerup', true],
		['pointercancel', true],
		['blur', undefined],
	]);

	stop();
	stop();
	assert.deepEqual(calls.slice(4), [
		['remove', 'pointermove', true, true],
		['remove', 'pointerup', true, true],
		['remove', 'pointercancel', true, true],
		['remove', 'blur', undefined, true],
	]);
});
