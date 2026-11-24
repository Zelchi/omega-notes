import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfReaderZoomController, findPdfReaderZoomAnchor } from '../src/features/manage-pdfs/model/zoom-position.ts';

const findAnchor = (page, bounds, point) =>
	findPdfReaderZoomAnchor([[page, bounds]], value => value, point);

const createFixture = () => {
	let zoom = 1;
	let bounds;
	const host = {
		scrollLeft: 100,
		scrollTop: 200,
		scrollWidth: 1200,
		clientWidth: 600,
	};
	const controller = createPdfReaderZoomController({
		getZoom: () => zoom,
		setZoom: value => { zoom = value; },
		getHost: () => host,
		getPageBounds: page => page === 2 ? bounds : undefined,
	});
	return {
		controller,
		host,
		get zoom() { return zoom; },
		set zoom(value) { zoom = value; },
		set bounds(value) { bounds = value; },
	};
};

test('pointer coordinates resolve to normalized positions inside the matching page', () => {
	assert.deepEqual(
		findAnchor(2, { left: 50, top: 100, width: 200, height: 400 }, { clientX: 100, clientY: 300 }),
		{ page: 2, x: 0.25, y: 0.5, clientX: 100, clientY: 300 },
	);
});

test('pointer anchor includes page edges and ignores degenerate or nonmatching bounds', () => {
	assert.deepEqual(
		findAnchor(2, { left: 10, top: 10, width: 20, height: 20 }, { clientX: 30, clientY: 30 }),
		{ page: 2, x: 1, y: 1, clientX: 30, clientY: 30 },
	);
	assert.equal(
		findAnchor(1, { left: 0, top: 0, width: 0, height: 100 }, { clientX: 0, clientY: 20 }),
		undefined,
	);
	assert.equal(
		findAnchor(1, { left: 10, top: 10, width: 20, height: 20 }, { clientX: 31, clientY: 30 }),
		undefined,
	);
});

test('wheel anchor searches visible page elements and returns only the page under the pointer', () => {
	const pages = new Map([
		[1, { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } }],
		[2, { canvas: { getBoundingClientRect: () => ({ left: 120, top: 0, width: 100, height: 100 }) } }],
		[3, {}],
	]);
	const getBounds = elements => elements.canvas?.getBoundingClientRect();
	const point = { clientX: 140, clientY: 40 };

	assert.deepEqual(findPdfReaderZoomAnchor(pages, getBounds, point), {
		page: 2,
		x: 0.2,
		y: 0.4,
		clientX: 140,
		clientY: 40,
	});
	assert.equal(findPdfReaderZoomAnchor(pages, getBounds, { clientX: 400, clientY: 40 }), undefined);
});

test('pointer zoom restores the same page point after the page rerenders', () => {
	const fixture = createFixture();
	fixture.bounds = { left: 40, top: 50, width: 400, height: 800 };

	assert.equal(fixture.controller.change(0.1, {
		page: 2,
		x: 0.25,
		y: 0.5,
		clientX: 100,
		clientY: 100,
	}), true);
	assert.equal(fixture.zoom, 1.1);

	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [140, 550]);
	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [140, 550]);
});

test('button zoom recenters horizontally after rendering without changing vertical scroll', () => {
	const fixture = createFixture();
	fixture.host.scrollLeft = 12;
	fixture.host.scrollTop = 79;

	assert.equal(fixture.controller.change(0.1), true);
	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [300, 79]);
});

test('reset returns to minimum zoom and recenters after rendering', () => {
	const fixture = createFixture();
	fixture.controller.change(0.8);

	assert.equal(fixture.controller.reset(), true);
	assert.equal(fixture.zoom, 1);
	fixture.controller.restoreAfterRender();
	assert.equal(fixture.host.scrollLeft, 300);
});

test('navigation and document replacement discard pending zoom restoration', () => {
	const fixture = createFixture();
	fixture.bounds = { left: 40, top: 50, width: 400, height: 800 };
	fixture.controller.change(0.1, {
		page: 2,
		x: 0.25,
		y: 0.5,
		clientX: 100,
		clientY: 100,
	});

	fixture.controller.clearAnchor();
	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [100, 200]);

	fixture.controller.change(0.1);
	fixture.controller.resetDocument();
	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [100, 200]);
});

test('a zoom change at the limit does not enqueue a position update', () => {
	const fixture = createFixture();
	fixture.zoom = 3;
	assert.equal(fixture.controller.change(0.1), false);
	fixture.controller.restoreAfterRender();
	assert.deepEqual([fixture.host.scrollLeft, fixture.host.scrollTop], [100, 200]);
});
