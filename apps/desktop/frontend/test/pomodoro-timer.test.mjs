import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { usePomodoro } from '../src/features/pomodoro/model/controller.ts';
import { deferred, mockDesktop } from './helpers.mjs';

const setup = (t, invoke) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	globalThis.window = { omegaDesktop: mockDesktop(invoke) };
	globalThis.localStorage = { getItem: () => null, setItem: () => {} };
	let pomodoro;
	createRoot(dispose => {
		t.after(() => {
			dispose();
			if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
			else delete globalThis.window;
			if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
			else delete globalThis.localStorage;
		});
		pomodoro = usePomodoro(() => undefined);
	});
	return pomodoro;
};

const snapshot = (overrides = {}) => ({
	phase: 'focus', remainingSeconds: 25 * 60, durationSeconds: 25 * 60, running: false,
	focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4,
	...overrides,
});

const waitFor = async predicate => {
	for (let attempt = 0; attempt < 500; attempt++) {
		if (predicate()) return;
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	throw new Error('Timed out waiting for Pomodoro state');
};

test('initialization can be retried after repeated transient failures', async t => {
	t.mock.method(console, 'error', () => {});
	let attempts = 0;
	const pomodoro = setup(t, async command => {
		assert.equal(command, 'initialize_pomodoro_timer');
		if (++attempts < 3) throw Error('transient timer failure');
		return snapshot({ phase: 'shortBreak', remainingSeconds: 210, durationSeconds: 300 });
	});

	await waitFor(() => pomodoro.timerError());
	assert.equal(pomodoro.timerReady(), false);
	assert.equal(pomodoro.error(), false);
	assert.equal(pomodoro.settingsError(), false);
	await pomodoro.retryTimer();
	assert.equal(pomodoro.timerError(), true);
	assert.equal(pomodoro.timerReady(), false);
	await pomodoro.retryTimer();

	assert.equal(attempts, 3);
	assert.equal(pomodoro.timerError(), false);
	assert.equal(pomodoro.timerReady(), true);
	assert.equal(pomodoro.phase(), 'shortBreak');
	assert.equal(pomodoro.seconds(), 210);
});

test('retry reads authoritative state after a mutation succeeded but its response failed', async t => {
	t.mock.method(console, 'error', () => {});
	let backend = snapshot({ remainingSeconds: 900 });
	const calls = [];
	const pomodoro = setup(t, async command => {
		calls.push(command);
		if (command === 'initialize_pomodoro_timer') return backend;
		if (command === 'start_pomodoro_timer') {
			backend = { ...backend, running: true, remainingSeconds: 872 };
			throw Error('response failed after backend mutation');
		}
		if (command === 'read_pomodoro_timer') return backend;
		throw Error(`Unexpected timer command: ${command}`);
	});

	await waitFor(() => pomodoro.timerReady());
	pomodoro.start();
	await waitFor(() => pomodoro.timerError());
	assert.equal(pomodoro.timerReady(), false);
	assert.equal(pomodoro.running(), false);
	await pomodoro.retryTimer();

	assert.deepEqual(calls, ['initialize_pomodoro_timer', 'start_pomodoro_timer', 'read_pomodoro_timer']);
	assert.equal(pomodoro.timerReady(), true);
	assert.equal(pomodoro.running(), true);
	assert.equal(pomodoro.seconds(), 872);
	assert.equal(pomodoro.tasks().length, 0);
	assert.equal(pomodoro.muteLofiDuringBreaks(), true);
});

test('polling stops after one failed read and resumes from a fresh snapshot', async t => {
	t.mock.method(console, 'error', () => {});
	const firstRead = deferred();
	let reads = 0;
	const backend = snapshot({ running: true, remainingSeconds: 1_200 });
	const pomodoro = setup(t, async command => {
		if (command === 'initialize_pomodoro_timer') return backend;
		if (command === 'read_pomodoro_timer') {
			reads += 1;
			if (reads === 1) return firstRead.promise;
			return backend;
		}
		throw Error(`Unexpected timer command: ${command}`);
	});

	await waitFor(() => reads === 1);
	await new Promise(resolve => setTimeout(resolve, 550));
	assert.equal(reads, 1);
	firstRead.reject(Error('transient polling failure'));
	await waitFor(() => pomodoro.timerError());
	await pomodoro.retryTimer();

	assert.equal(reads, 2);
	assert.equal(pomodoro.timerReady(), true);
	assert.equal(pomodoro.running(), true);
	assert.equal(pomodoro.seconds(), 1_200);
});

test('a delayed response from an older timer operation cannot replace a newer action', async t => {
	const nextResponse = deferred();
	const resetResponse = deferred();
	const nextStarted = deferred();
	const resetStarted = deferred();
	const initial = snapshot({ remainingSeconds: 900 });
	const resetSnapshot = snapshot({ remainingSeconds: 1_500 });
	const pomodoro = setup(t, async command => {
		if (command === 'initialize_pomodoro_timer') return initial;
		if (command === 'next_pomodoro_phase') { nextStarted.resolve(); return nextResponse.promise; }
		if (command === 'reset_pomodoro_timer') { resetStarted.resolve(); return resetResponse.promise; }
		throw Error(`Unexpected timer command: ${command}`);
	});

	await waitFor(() => pomodoro.timerReady());
	pomodoro.next();
	await nextStarted.promise;
	pomodoro.reset();
	nextResponse.resolve(snapshot({ phase: 'shortBreak', remainingSeconds: 300, durationSeconds: 300 }));
	await resetStarted.promise;
	assert.equal(pomodoro.phase(), 'focus');
	resetResponse.resolve(resetSnapshot);
	await waitFor(() => pomodoro.phase() === 'focus' && pomodoro.seconds() === 1_500);
});
