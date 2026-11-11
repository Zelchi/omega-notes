import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { buildMusicSources, nextUnattemptedSourceIndex, parseSomaFmChannels } from '../src/features/lofi-player/model/sources.ts';

const finiteSources = [
	{ id: 'fixture-a', name: 'Fixture A', url: 'https://fixture.invalid/a.mp3', provider: 'somafm' },
	{ id: 'fixture-b', name: 'Fixture B', url: 'https://fixture.invalid/b.mp3', provider: 'somafm' },
];

const playerRuntime = {
	solid: {
		createContext: () => ({ Provider: 'provider' }),
		createEffect: () => {},
		createSignal: initial => {
			let value = initial;
			return [() => value, next => { value = typeof next === 'function' ? next(value) : next; }];
		},
		onCleanup: () => {},
		onMount: () => {},
		useContext: () => undefined,
	},
	isNoteMediaPlaying: () => false,
	getMusicStreamUrl: url => playerRuntime.resolveStream(url),
	buildMusicSources: () => finiteSources,
	nextUnattemptedSourceIndex,
	parseSomaFmChannels: () => [],
	somaFmSource: finiteSources[0],
	styles: { audio: 'audio' },
	jsx: (type, props) => {
		if (type === 'audio') {
			const audio = playerRuntime.audio;
			props.ref(audio);
			audio.handlers = {
				playing: props.onPlaying,
				pause: props.onPause,
				waiting: props.onWaiting,
				stalled: props.onStalled,
				error: props.onError,
				ended: props.onEnded,
			};
			return { type, props };
		}
		if (type === 'provider') {
			playerRuntime.player = props.value;
			return props.children;
		}
		return { type, props };
	},
};
globalThis.__lofiPlayerTestRuntime = playerRuntime;

const playerTsx = await readFile(new URL('../src/features/lofi-player/model/player.tsx', import.meta.url), 'utf8');
const playerJavaScript = ts.transpileModule(playerTsx, {
	compilerOptions: {
		jsx: ts.JsxEmit.React,
		jsxFactory: 'jsx',
		jsxFragmentFactory: 'Fragment',
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.ES2022,
	},
}).outputText.replace(/^import\b.*?;\s*$/gm, '');
const playerTestModule = await import(`data:text/javascript;base64,${Buffer.from(`
	const runtime = globalThis.__lofiPlayerTestRuntime;
	const { createContext, createEffect, createSignal, onCleanup, onMount, useContext } = runtime.solid;
	const { isNoteMediaPlaying, getMusicStreamUrl } = runtime;
	const { buildMusicSources, nextUnattemptedSourceIndex, parseSomaFmChannels, somaFmSource } = runtime;
	const { styles } = runtime;
	const jsx = runtime.jsx;
	const jsxs = runtime.jsx;
	${playerJavaScript}
`).toString('base64')}`);

function createFiniteAudio() {
	return {
		src: '',
		currentSrc: '',
		volume: 0,
		ended: false,
		handlers: {},
		pause() { this.handlers.pause?.(); },
		removeAttribute(name) { if (name === 'src') { this.src = ''; this.currentSrc = ''; } },
		load() { this.currentSrc = this.src; this.ended = false; },
		play() { return Promise.resolve(); },
		emit(name) {
			if (name === 'ended') this.ended = true;
			this.handlers[name]?.({ currentTarget: this });
		},
	};
}

async function createPlayer(t, resolveStream) {
	const audio = createFiniteAudio();
	playerRuntime.audio = audio;
	playerRuntime.player = undefined;
	playerRuntime.resolveStream = resolveStream;
	playerTestModule.LofiPlayerProvider({ children: null });
	const player = playerRuntime.player;
	assert.ok(player);
	t.after(() => { if (player.isActive()) player.togglePlayback(); });
	return { audio, player };
}

async function waitFor(predicate) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) return;
		await new Promise(resolve => setImmediate(resolve));
	}
	assert.ok(predicate(), 'expected the mocked audio transition to complete');
}

test('player only offers the four fixed SomaFM channels in a stable order', () => {
	const sources = buildMusicSources();
	assert.deepEqual(sources.map(({ name, url, provider }) => [name, url, provider]), [
		['Lush', 'https://ice5.somafm.com/lush-128-mp3', 'somafm'],
		['Salad', 'https://ice5.somafm.com/groovesalad-128-mp3', 'somafm'],
		['Blender', 'https://ice5.somafm.com/beatblender-128-mp3', 'somafm'],
		['Fluid', 'https://ice5.somafm.com/fluid-128-mp3', 'somafm'],
	]);
});

test('SomaFM metadata parser returns current tracks for every valid channel', () => {
	assert.deepEqual(parseSomaFmChannels({ channels: [
		{ id: 'groovesalad', title: ' Groove Salad ', lastPlaying: 'Fresh Moods - Melian' },
		{ id: 'fluid', title: 'Fluid', lastPlaying: 'Artist - Track' },
		{ id: 'broken', title: '', lastPlaying: 'Ignored' },
		{ id: 42, title: 'Invalid channel' },
	] }), [
		{ id: 'groovesalad', title: 'Groove Salad', lastPlaying: 'Fresh Moods - Melian' },
		{ id: 'fluid', title: 'Fluid', lastPlaying: 'Artist - Track' },
	]);
	assert.deepEqual(parseSomaFmChannels({ channels: [] }), []);
});

test('fallback advances through each source once and stops when all failed', () => {
	const attempted = new Set();
	const tried = [];
	for (let next = nextUnattemptedSourceIndex(0, 3, attempted); next !== undefined; next = nextUnattemptedSourceIndex(next + 1, 3, attempted)) {
		tried.push(next);
		attempted.add(next);
	}
	assert.deepEqual(tried, [0, 1, 2]);
	assert.equal(nextUnattemptedSourceIndex(0, 3, attempted), undefined);
	assert.equal(nextUnattemptedSourceIndex(-1, 3, new Set([0, 1])), 2);
});

test('a finite playing source ending advances once to the next source', async t => {
	const requests = [];
	let resolveNext;
	const { audio, player } = await createPlayer(t, url => {
		requests.push(url);
		return requests.length === 2
			? new Promise(resolve => { resolveNext = resolve; })
			: Promise.resolve('https://fixture.invalid/proxy/first');
	});

	player.togglePlayback();
	await waitFor(() => audio.currentSrc !== '');
	audio.emit('playing');
	assert.equal(player.status(), 'playing');

	audio.emit('ended');
	assert.equal(requests.length, 2);
	assert.equal(player.status(), 'loading');
	assert.equal(player.sourceName(), 'Fixture B');
	assert.equal(audio.currentSrc, '', 'the previous local stream is detached before the next URL resolves');
	audio.emit('ended');
	assert.equal(requests.length, 2, 'a duplicate ended event cannot advance the new attempt');

	resolveNext('https://fixture.invalid/proxy/second');
	await waitFor(() => audio.currentSrc.endsWith('/second'));
	audio.emit('playing');
	assert.equal(player.status(), 'playing');
});

test('finite sources exhaust into failed status instead of silent playing', async t => {
	const requests = [];
	const { audio, player } = await createPlayer(t, url => {
		requests.push(url);
		return Promise.resolve(`https://fixture.invalid/proxy/${requests.length}`);
	});

	player.togglePlayback();
	await waitFor(() => audio.currentSrc !== '');
	audio.emit('playing');
	const firstSource = audio.currentSrc;
	audio.emit('ended');
	await waitFor(() => audio.currentSrc !== firstSource);
	audio.emit('playing');
	audio.emit('ended');

	assert.equal(requests.length, 2);
	assert.equal(player.status(), 'failed');
	assert.equal(player.isActive(), false);
	audio.emit('ended');
	assert.equal(requests.length, 2);
});

test('pausing before a finite source ends prevents fallback', async t => {
	const requests = [];
	const { audio, player } = await createPlayer(t, url => {
		requests.push(url);
		return Promise.resolve('https://fixture.invalid/proxy/first');
	});

	player.togglePlayback();
	await waitFor(() => audio.currentSrc !== '');
	audio.emit('playing');
	player.togglePlayback();
	assert.equal(player.status(), 'paused');
	assert.equal(audio.src, '');
	assert.equal(audio.currentSrc, '', 'pause detaches the local proxy stream');
	audio.emit('ended');

	assert.equal(requests.length, 1);
	assert.equal(player.status(), 'paused');
});

test('manual station change invalidates an unresolved fallback transition', async t => {
	const requests = [];
	let resolveObsolete;
	const { audio, player } = await createPlayer(t, url => {
		requests.push(url);
		if (requests.length === 2) return new Promise(resolve => { resolveObsolete = resolve; });
		return Promise.resolve(`https://fixture.invalid/proxy/${requests.length}`);
	});

	player.togglePlayback();
	await waitFor(() => audio.currentSrc.endsWith('/1'));
	audio.emit('playing');
	audio.emit('ended');
	assert.equal(requests.length, 2);
	player.nextSource();
	await waitFor(() => audio.currentSrc.endsWith('/3'));
	assert.equal(player.sourceName(), 'Fixture A');

	resolveObsolete('https://fixture.invalid/proxy/obsolete');
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(audio.currentSrc, 'https://fixture.invalid/proxy/3');
	audio.emit('playing');
	assert.equal(player.status(), 'playing');
});
