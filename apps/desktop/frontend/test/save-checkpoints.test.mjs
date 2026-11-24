import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveCheckpoints } from '../src/app/model/save-checkpoints.ts';
import { deferred } from './helpers.mjs';

const names = ['saveNoteTitle', 'saveNotes', 'saveAiChats', 'saveKanban', 'savePdfs', 'savePomodoro', 'saveStudies'];
const fixture = (failure, pending) => {
	const calls = [];
	const options = { resolvingConflict: () => failure === 'conflict' };
	for (const name of names) options[name] = async () => {
		calls.push(name);
		if (name === pending?.name) await pending.gate.promise;
		return name !== failure;
	};
	return { calls, ...createSaveCheckpoints(options) };
};

test('shutdown waits for every checkpoint in order', async () => {
	const gate = deferred();
	const f = fixture(undefined, { name: 'saveKanban', gate });
	const result = f.beforeShutdown();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(f.calls, names.slice(0, 4));
	gate.resolve();
	assert.equal(await result, true);
	assert.deepEqual(f.calls, names);
});

test('a failed checkpoint or conflict blocks later saves and shutdown', async () => {
	const conflict = fixture('conflict');
	assert.equal(await conflict.beforeShutdown(), false);
	assert.deepEqual(conflict.calls, []);
	for (const [index, name] of names.entries()) {
		const f = fixture(name);
		assert.equal(await f.beforeShutdown(), false, name);
		assert.deepEqual(f.calls, names.slice(0, index + 1), name);
	}
});

test('AI requests save note and chat state without flushing unrelated features', async () => {
	const f = fixture();
	assert.equal(await f.beforeAiRequest(), true);
	assert.deepEqual(f.calls, names.slice(0, 3));
});
