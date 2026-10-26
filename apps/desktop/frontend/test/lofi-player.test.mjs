import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMusicSources, nextUnattemptedSourceIndex, parseRadioBrowserSources, parseSomaFmFluid } from '../src/features/lofi-player/model/sources.ts';

test('Radio Browser sources only accept healthy HTTPS MP3 lofi stations', () => {
	const stations = parseRadioBrowserSources([
		{ name: 'Lo-fi HTTPS', tags: 'chill,lofi hip hop', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://radio.example/live.mp3' },
		{ name: 'HTTP only', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'http://radio.example/live.mp3' },
		{ name: 'Broken', tags: 'lofi', codec: 'MP3', lastcheckok: 0, url_resolved: 'https://broken.example/live.mp3' },
		{ name: 'Not lofi', tags: 'ambient', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://ambient.example/live.mp3' },
		{ name: 'Unsupported codec', tags: 'lofi', codec: 'AAC', lastcheckok: 1, url_resolved: 'https://aac.example/live' },
		{ name: 'Credential URL', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://user:pass@radio.example/live.mp3' },
	]);

	assert.deepEqual(stations.map(({ name, url }) => [name, url]), [
		['Lo-fi HTTPS', 'https://radio.example/live.mp3'],
	]);
});

test('Radio Browser keeps four candidates so stale stations do not exhaust the directory fallback', () => {
	const sources = buildMusicSources([
		{ name: 'First', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://first.example/live.mp3' },
		{ name: 'Second', tags: 'lo-fi', codec: 'MP3', lastcheckok: true, url_resolved: 'https://second.example/live.mp3' },
		{ name: 'Third', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://third.example/live.mp3' },
		{ name: 'Fourth', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://fourth.example/live.mp3' },
		{ name: 'Fifth', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://fifth.example/live.mp3' },
	]);

	assert.deepEqual(sources.map(({ url }) => url), [
		'https://first.example/live.mp3',
		'https://second.example/live.mp3',
		'https://third.example/live.mp3',
		'https://fourth.example/live.mp3',
		'https://stream.zeno.fm/tabzverz0fctv',
		'https://ice5.somafm.com/fluid-128-mp3',
		'https://ice6.somafm.com/fluid-128-mp3',
	]);
});

test('static stations and both SomaFM servers remain available when Radio Browser is empty', () => {
	const sources = buildMusicSources([]);
	assert.deepEqual(sources.map(({ url }) => url), [
		'https://stream.zeno.fm/tabzverz0fctv',
		'https://public.isekoi-radio.com/listen/chill/radio.mp3',
		'https://0nlineradio.radioho.st/0r-lo-fi?ref=radio-browser26',
		'https://stream.yojosuknam.com/live.mp3',
		'https://ice5.somafm.com/fluid-128-mp3',
		'https://ice6.somafm.com/fluid-128-mp3',
	]);
});

test('discovered stations are deduplicated against permanent fallbacks', () => {
	const sources = buildMusicSources([
		{ name: '0R Lo-Fi', tags: 'lofi', codec: 'MP3', lastcheckok: 1, url_resolved: 'https://0nlineradio.radioho.st/0r-lo-fi?ref=radio-browser26' },
	]);
	assert.equal(sources.filter(({ url }) => url === 'https://0nlineradio.radioho.st/0r-lo-fi?ref=radio-browser26').length, 1);
});

test('SomaFM metadata parser returns Fluid title and current track only', () => {
	assert.deepEqual(parseSomaFmFluid({ channels: [
		{ id: 'groovesalad', title: 'Groove Salad', lastPlaying: 'Other track' },
		{ id: 'fluid', title: 'Fluid', lastPlaying: 'Artist - Track' },
	] }), { title: 'Fluid', lastPlaying: 'Artist - Track' });
	assert.equal(parseSomaFmFluid({ channels: [] }), undefined);
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
