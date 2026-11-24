import assert from 'node:assert/strict';
import test from 'node:test';
import { createKanbanWipEditorHandlers } from '../src/features/manage-kanban/model/wip-editor.ts';

const setup = (overrides = {}) => {
	const state = { status: 'inProgress', input: { valueAsNumber: 4 } };
	const calls = [];
	const handlers = createKanbanWipEditorHandlers({
		readStatus: () => state.status,
		readInput: () => state.input,
		setLimit: (status, limit) => calls.push(['set', status, limit]),
		close: () => { calls.push(['close']); state.status = undefined; },
		isInsideInput: (target, input) => target === input || target === 'input-child',
		...overrides,
	});
	return { state, calls, handlers };
};

test('Kanban WIP editor commits the matching lane and closes, but ignores stale blur events', () => {
	const { state, calls, handlers } = setup();

	handlers.finish('review', { valueAsNumber: 8 });
	assert.deepEqual(calls, []);

	handlers.finish('inProgress', { valueAsNumber: 6 });
	assert.deepEqual(calls, [['set', 'inProgress', 6], ['close']]);
	assert.equal(state.status, undefined);
});

test('Kanban WIP editor treats zero and an empty numeric value as unlimited', () => {
	const { calls, handlers } = setup();

	handlers.finish('inProgress', { valueAsNumber: 0 });
	assert.deepEqual(calls, [['set', 'inProgress', undefined], ['close']]);

	const empty = setup();
	empty.handlers.finish('inProgress', { valueAsNumber: Number.NaN });
	assert.deepEqual(empty.calls, [['set', 'inProgress', undefined], ['close']]);
});

test('outside pointer commits the active WIP input but ignores the input and its descendants', () => {
	const { state, calls, handlers } = setup();

	handlers.commitOutside(state.input);
	handlers.commitOutside('input-child');
	assert.deepEqual(calls, []);

	handlers.commitOutside('other-target');
	assert.deepEqual(calls, [['set', 'inProgress', 4], ['close']]);
});

test('outside pointer does nothing when the editor status or input is unavailable', () => {
	const noStatus = setup();
	noStatus.state.status = undefined;
	noStatus.handlers.commitOutside('other-target');
	assert.deepEqual(noStatus.calls, []);

	const noInput = setup();
	noInput.state.input = undefined;
	noInput.handlers.commitOutside('other-target');
	assert.deepEqual(noInput.calls, []);
});
