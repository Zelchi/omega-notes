import assert from 'node:assert/strict';
import test from 'node:test';
import { Channel, invoke } from '../src/shared/lib/desktop.ts';

test('desktop channels preserve late stream events and close on exit, ordinary completion, or failure', async () => {
	const oldWindow = globalThis.window;
	let deliver;
	let rejectCommand = false;
	const calls = [];
	globalThis.window = { omegaDesktop: {
		onChannel(callback) { deliver = callback; },
		async invoke(command, args) {
			calls.push({ command, args });
			if (rejectCommand) throw Error('RPC failed');
			return 'ok';
		},
	} };
	try {
		const stream = new Channel();
		const received = [];
		stream.onmessage = message => received.push(message);
		assert.equal(await invoke('stream_note_summaries', { nested: [stream] }), 'ok');
		assert.deepEqual(calls[0].args, { nested: [{ __omegaChannel: stream.id }] });
		deliver(stream.id, { kind: 'batch' });
		deliver(stream.id, { kind: 'exit' });
		deliver(stream.id, { kind: 'batch' });
		assert.deepEqual(received.map(message => message.kind), ['batch', 'exit']);

		for (const command of ['terminal_open', 'stream_note_summaries', 'read_studies']) {
			const persistent = new Channel();
			const events = [];
			persistent.onmessage = message => events.push(message);
			await invoke(command, { output: persistent });
			deliver(persistent.id, { kind: 'batch' });
			deliver(persistent.id, { kind: 'exit' });
			assert.deepEqual(events.map(message => message.kind), ['batch', 'exit'], `${command} must survive its RPC response`);
		}

		const ordinary = new Channel();
		ordinary.onmessage = () => assert.fail('ordinary channel should be closed');
		await invoke('ordinary_command', { channel: ordinary });
		deliver(ordinary.id, {});

		const failed = new Channel();
		failed.onmessage = () => assert.fail('failed channel should be closed');
		rejectCommand = true;
		await assert.rejects(invoke('stream_note_summaries', { channel: failed }), /RPC failed/);
		deliver(failed.id, {});
	} finally {
		globalThis.window = oldWindow;
	}
});

test('persistent stream commands are wired through consumers, Rust dispatch, and both desktop hosts', async () => {
	const [desktop, notes, studies, terminal, dispatch, electronPreload, electronMain, tauriAdapter, tauriMain] = await Promise.all([
		source('../src/shared/lib/desktop.ts'),
		source('../src/entities/note/api/desktop-notes.repository.ts'),
		source('../src/entities/study/api/studies.repository.ts'),
		source('../src/features/gambiarra-terminal/api/terminal.repository.ts'),
		source('../../backend/src/dispatch.rs'),
		source('../../bridge/electron/preload.cjs'),
		source('../../bridge/electron/main.mjs'),
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	const contracts = [
		{ command: 'stream_note_summaries', field: 'onItem', consumer: notes },
		{ command: 'read_studies', field: 'onItem', consumer: studies },
		{ command: 'terminal_open', field: 'output', consumer: terminal },
	];
	for (const { command, field, consumer } of contracts) {
		assert.ok(consumer.includes(`"${command}"`), `${command} consumer`);
		assert.ok(consumer.includes(field), `${command} channel argument`);
		assert.match(dispatch, new RegExp(`"${command}" =>[\\s\\S]{0,700}Channel::from_argument\\(&app, &args, "${field}"\\)`));
		assert.ok(desktop.includes(`command !== '${command}'`), `${command} remains open after the RPC response`);
	}
	assert.match(electronPreload, /ipcRenderer\.invoke\('omega:invoke', command, args\)/);
	assert.match(electronPreload, /ipcRenderer\.on\('omega:channel', listener\)/);
	assert.match(electronMain, /ipcMain\.handle\('omega:invoke'/);
	assert.match(electronMain, /send\('omega:channel', message\.channel, message\.payload\)/);
	assert.match(tauriAdapter, /tauriInvoke<T>\('desktop_dispatch', \{ command, args \}\)/);
	assert.match(tauriAdapter, /tauriListen<\{ id: string; payload: unknown \}>\('omega:channel'/);
	assert.match(tauriMain, /async fn desktop_dispatch[\s\S]*backend\.invoke\(command, args\)\.await/);
	assert.match(tauriMain, /"omega:channel"[\s\S]*json!\(\{"id":id,"payload":message\.get\("payload"\)\}\)/);
});

async function source(path) {
	const { readFile } = await import('node:fs/promises');
	return (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
}
