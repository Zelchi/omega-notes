import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useGambiarraTerminal } from '../src/features/gambiarra-terminal/model/controller.ts';
import { deferred, settle } from './helpers.mjs';

const setup = t => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const openings = [], resizes = [];
	let receiveChannel;
	globalThis.window = {
		omegaDesktop: {
			onChannel: callback => { receiveChannel = callback; },
			onEvent: () => () => { },
			invoke: (command, args) => {
				if (command === 'terminal_open') {
					const gate = deferred();
					openings.push({ args, gate });
					return gate.promise;
				}
				if (command === 'terminal_resize') { resizes.push(args); return Promise.resolve(); }
				if (command === 'terminal_sync_instructions' || command === 'terminal_close') return Promise.resolve();
				throw Error(`Unexpected terminal command: ${command}`);
			},
		}
	};
	let session, dispose;
	const [vaultId, setVaultId] = createSignal('fixture-vault');
	const [enabled] = createSignal(true);
	createRoot(cleanup => {
		dispose = cleanup;
		session = useGambiarraTerminal({ vaultId, enabled, onCliExit: () => { } });
	});
	t.after(async () => {
		dispose();
		await settle();
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
		else delete globalThis.window;
	});
	return {
		session,
		openings,
		resizes,
		setVaultId,
		exit: id => receiveChannel(id, { kind: 'exit', code: 0 }),
	};
};

const waitForOpen = async (openings, count = 1) => {
	for (let attempt = 0; attempt < 10 && openings.length < count; attempt++) await settle();
	assert.ok(openings.length >= count, `terminal_open #${count} should be invoked`);
};

test('the current xterm size is applied when the delayed initial open completes', async t => {
	const { session, openings, resizes } = setup(t);
	session.selectProvider('opencode');
	await waitForOpen(openings);

	session.resize(121, 37);
	assert.deepEqual(resizes, []);
	openings[0].gate.resolve();
	await settle();

	assert.deepEqual(resizes.map(({ cols, rows }) => [cols, rows]), [[121, 37]]);
	session.resize(140, 45);
	await settle();
	assert.deepEqual(resizes.map(({ cols, rows }) => [cols, rows]), [[121, 37], [140, 45]]);
});

test('a restarted terminal receives dimensions measured before its open completes', async t => {
	const { session, openings, resizes, exit } = setup(t);
	session.selectProvider('opencode');
	await waitForOpen(openings);
	openings[0].gate.resolve();
	await settle();
	exit(openings[0].args.output.__omegaChannel);
	session.restart();
	await waitForOpen(openings, 2);

	session.resize(132, 42);
	openings[1].gate.resolve();
	await settle();

	assert.deepEqual(resizes.map(({ cols, rows }) => [cols, rows]), [[132, 42]]);
});

test('a late open from a previous vault cannot apply saved dimensions', async t => {
	const { session, openings, resizes, setVaultId } = setup(t);
	session.selectProvider('opencode');
	await waitForOpen(openings);
	session.resize(128, 40);
	setVaultId('other-fixture-vault');
	await settle();
	openings[0].gate.resolve();
	await settle();

	assert.deepEqual(resizes, []);
});
