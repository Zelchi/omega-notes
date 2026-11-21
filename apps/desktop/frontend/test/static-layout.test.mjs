import assert from 'node:assert/strict';
import test from 'node:test';
import { pushStaticNodes, separateStaticNodes } from '../src/pages/canvas/lib/static-layout.ts';

test('locked notes stay fixed and overlapping unlocked notes move around them', () => {
	const positions = { movable: { x: 0, y: 0 }, locked: { x: 0, y: 0 } };
	const nodes = [{ id: 'movable', width: 80, height: 40 }, { id: 'locked', width: 80, height: 40 }];
	const next = separateStaticNodes(positions, nodes, new Set(['movable']), new Set(['locked']));

	assert.deepEqual(next.locked, positions.locked);
	assert.notDeepEqual(next.movable, positions.movable);
	assert.deepEqual(positions.movable, { x: 0, y: 0 });
});

test('overlapping locked notes keep both original positions', () => {
	const positions = { first: { x: 0, y: 0 }, second: { x: 0, y: 0 } };
	const nodes = [{ id: 'first', width: 80, height: 40 }, { id: 'second', width: 80, height: 40 }];

	assert.equal(separateStaticNodes(positions, nodes, new Set(), new Set(['first', 'second'])), positions);
});

const point = (x, y = 0) => ({ x, y });
const squareNodes = (positions) => Object.keys(positions).reverse().map(id => ({ id, width: 40, height: 40 }));

test('dragging across several notes pushes each forward in order, regardless of input order', () => {
	const positions = { a: point(0), b: point(60), c: point(120), d: point(180), outside: point(80, 52) };
	const next = pushStaticNodes(positions, squareNodes(positions), new Set(['a']), new Set(), point(200));

	assert.deepEqual(next, { a: point(200), b: point(252), c: point(304), d: point(356), outside: point(80, 52) });
	assert.equal(next.outside, positions.outside);
	assert.deepEqual(positions.b, point(60));
});

test('a chain is not limited to a fixed number of notes', () => {
	const positions = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`n${index}`, point(index * 52)]));
	const next = pushStaticNodes(positions, squareNodes(positions), new Set(['n0']), new Set(), point(20));

	assert.deepEqual(next, Object.fromEntries(Object.entries(positions).map(([id, { x }]) => [id, point(x + 20)])));
});

test('pushing a chain up or left preserves order with different note sizes', () => {
	const positions = { a: point(10, 150), b: point(10, 90), c: point(10, 20) };
	const nodes = [
		{ id: 'c', width: 30, height: 30 },
		{ id: 'a', width: 40, height: 40 },
		{ id: 'b', width: 50, height: 40 },
	];
	const drag = new Set(['a']);
	const locked = new Set();
	const up = pushStaticNodes(positions, nodes, drag, locked, point(0, -100));
	assert.deepEqual(up, { a: point(10, 50), b: point(10, -2), c: point(10, -44) });

	const transpose = (layout) => Object.fromEntries(Object.entries(layout).map(([id, { x, y }]) => [id, point(y, x)]));
	assert.deepEqual(
		pushStaticNodes(transpose(positions), nodes.map(({ id, width, height }) => ({ id, width: height, height: width })), drag, locked, point(-100)),
		transpose(up),
	);
});

test('a locked note limits the entire selection while other notes advance only to contact', () => {
	const positions = { a: point(0), b: point(60), lock: point(120), selected: point(20, 120), other: point(100, 120) };
	const nodes = squareNodes(positions);
	const dragged = new Set(['a', 'selected']);
	const locked = new Set(['lock']);
	const next = pushStaticNodes(positions, nodes, dragged, locked, point(100));

	assert.deepEqual(next, { a: point(16), b: point(68), lock: point(120), selected: point(36, 120), other: point(100, 120) });
	assert.equal(pushStaticNodes(next, nodes, dragged, locked, point(100)), next);
	assert.deepEqual(pushStaticNodes(next, nodes, dragged, locked, point(-16)),
		{ ...next, a: point(0), selected: point(20, 120) });
});

test('a push can spread into multiple rows, including while moving diagonally', () => {
	const positions = { a: point(0, 30), b: point(60), c: point(60, 60), d: point(120, 30) };
	const next = pushStaticNodes(positions, squareNodes(positions), new Set(['a']), new Set(), point(80, 15));

	assert.deepEqual(next, { a: point(80, 45), b: point(132), c: point(132, 60), d: point(184, 30) });
});
