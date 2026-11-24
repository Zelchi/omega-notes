import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsyncTextReplacement } from '../src/shared/lib/async-text-replacement.ts';
import { deferred, settle } from './helpers.mjs';

const fixture = (initial = 'A link Z') => {
	let text = initial;
	const applied = [];
	const replacement = createAsyncTextReplacement({
		read: () => text,
		apply: (value, range, kind) => {
			applied.push({ value, range: { start: range.start, end: range.end }, kind });
			text = text.slice(0, range.start) + value + text.slice(range.end);
		},
	});
	const edit = (next, change) => {
		const previous = text;
		text = next;
		replacement.changed(previous, next, change);
	};
	return { ...replacement, applied, edit, text: () => text };
};

test('a delayed result follows edits before its range and preserves later edits', async () => {
	const f = fixture();
	const pending = deferred();
	f.resolve('link', { start: 2, end: 6 }, pending.promise, 'link-1');
	f.edit('+++A link Z');
	f.edit('+++A link Z!', { start: 11, end: 11, length: 1 });
	pending.resolve('[link](url)');
	await settle();
	assert.equal(f.text(), '+++A [link](url) Z!');
	assert.deepEqual(f.applied, [{ value: '[link](url)', range: { start: 5, end: 9 }, kind: 'link-1' }]);
});

test('overlapping edits and non-whitespace appended to a URL discard the delayed result', async () => {
	for (const [next, change] of [
		['A liXk Z', { start: 4, end: 5, length: 1 }],
		['A linkX Z', { start: 6, end: 6, length: 1 }],
	]) {
		const f = fixture();
		const pending = deferred();
		f.resolve('link', { start: 2, end: 6 }, pending.promise);
		f.edit(next, change);
		pending.resolve('replacement');
		await settle();
		assert.equal(f.text(), next);
		assert.deepEqual(f.applied, []);
	}
});

test('whitespace at the end does not invalidate a pending replacement', async () => {
	const f = fixture('A link');
	const pending = deferred();
	f.resolve('link', { start: 2, end: 6 }, pending.promise);
	f.edit('A link ', { start: 6, end: 6, length: 1 });
	pending.resolve('resolved');
	await settle();
	assert.equal(f.text(), 'A resolved ');
});

test('clear, rejected results and changed source do not apply stale text', async () => {
	const f = fixture();
	const cleared = deferred(), rejected = deferred(), changed = deferred();
	f.resolve('link', { start: 2, end: 6 }, cleared.promise);
	f.clear();
	cleared.resolve('bad');
	f.resolve('link', { start: 2, end: 6 }, rejected.promise);
	rejected.reject(Error('network'));
	f.resolve('wrong', { start: 2, end: 6 }, changed.promise);
	changed.resolve('bad');
	await settle();
	assert.equal(f.text(), 'A link Z');
	assert.deepEqual(f.applied, []);
});

test('only the 16 most recent pending replacements are retained', async () => {
	const f = fixture();
	const pending = Array.from({ length: 17 }, () => deferred());
	for (const [index, entry] of pending.entries()) {
		f.resolve('link', { start: 2, end: 6 }, entry.promise, `request-${index}`);
	}
	pending[0].resolve('old');
	await settle();
	assert.deepEqual(f.applied, []);
	pending[16].resolve('new');
	await settle();
	assert.equal(f.text(), 'A new Z');
	assert.equal(f.applied[0].kind, 'request-16');
});
