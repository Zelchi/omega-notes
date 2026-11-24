import assert from 'node:assert/strict';
import test from 'node:test';
import { readMuteLofiDuringBreaks, saveMuteLofiDuringBreaks } from '../src/features/pomodoro/api/tasks.repository.ts';
import { createPomodoroPlayHandler, shouldMuteLofi } from '../src/features/pomodoro/model/controller.ts';

const storage = t => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => data.set(key, String(value)),
	};
	t.after(() => {
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	});
	return data;
};

test('lo-fi is muted through both break phases when enabled, plus during the alarm', () => {
	assert.equal(shouldMuteLofi('focus', true, false), false);
	assert.equal(shouldMuteLofi('shortBreak', true, false), true);
	assert.equal(shouldMuteLofi('longBreak', true, false), true);
	assert.equal(shouldMuteLofi('shortBreak', false, false), false);
	assert.equal(shouldMuteLofi('focus', false, true), true);
});

test('Pomodoro Play pauses when running and Shift-start hides the window after starting', () => {
	const calls = [];
	let running = true;
	const handlePlay = createPomodoroPlayHandler({
		isRunning: () => running,
		pause: () => calls.push('pause'),
		start: () => { calls.push('start'); running = true; },
		hideWindow: () => calls.push('hide'),
	});

	handlePlay({ shiftKey: true });
	assert.deepEqual(calls, ['pause']);

	running = false;
	handlePlay({ shiftKey: false });
	assert.deepEqual(calls, ['pause', 'start']);

	running = false;
	handlePlay({ shiftKey: true });
	assert.deepEqual(calls, ['pause', 'start', 'start', 'hide']);
});

test('lo-fi break muting defaults on and persists independently', t => {
	const data = storage(t);
	assert.equal(readMuteLofiDuringBreaks(), true);
	assert.equal(saveMuteLofiDuringBreaks(false), true);
	assert.equal(readMuteLofiDuringBreaks(), false);
	assert.equal(data.get('omega-notes.pomodoro-mute-lofi-during-breaks.v1'), 'false');
	assert.equal(saveMuteLofiDuringBreaks(true), true);
	assert.equal(readMuteLofiDuringBreaks(), true);
	data.set('omega-notes.pomodoro-mute-lofi-during-breaks.v1', 'invalid');
	assert.equal(readMuteLofiDuringBreaks(), true);
});
