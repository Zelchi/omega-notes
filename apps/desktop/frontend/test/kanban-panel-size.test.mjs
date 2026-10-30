import assert from 'node:assert/strict';
import test from 'node:test';
import { getKanbanLayoutColumnCount, getKanbanPanelSnapPoints, getKanbanPanelWidthLimits, getKanbanPanelStage, resizeKanbanPanelForViewport, snapKanbanPanelWidth } from '../src/features/manage-kanban/model/panel-size.ts';
import { sidePanelViewportGutter, sidePanelWidth } from '../src/shared/lib/side-panel-layout.ts';

test('large windows expose all four active sessions, skipping logical level 3', () => {
	const viewportWidth = 1920;
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	const stops = getKanbanPanelSnapPoints(minWidth, maxWidth);

	assert.equal(stops.length, 4);
	assert.deepEqual(stops.map(width => getKanbanPanelStage(width, viewportWidth)), [1, 2, 4, 5]);
	assert.deepEqual(stops.map(width => getKanbanLayoutColumnCount(getKanbanPanelStage(width, viewportWidth))), [1, 1, 5, 5]);
});

test('Kanban keeps its current width as the minimum and reserves the Chat panel on the right', () => {
	const viewportWidth = 1200;
	const limits = getKanbanPanelWidthLimits(viewportWidth);

	assert.equal(limits.minWidth, 420);
	assert.equal(viewportWidth - 2 - 420 - limits.maxWidth, 16);
});

test('minimum window width fits two default panels with the same 16px center gap', () => {
	const viewportWidth = sidePanelWidth * 2 + 16 + 2;
	const limits = getKanbanPanelWidthLimits(viewportWidth);

	assert.equal(viewportWidth, 858);
	assert.deepEqual(limits, { minWidth: sidePanelWidth, maxWidth: sidePanelWidth });
	assert.equal(viewportWidth - 2 - sidePanelWidth - sidePanelWidth, 16);
});

test('Kanban stage 1 and Chat use the same responsive panel width', () => {
	for (const viewportWidth of [400, 900, 1200]) {
		const expectedWidth = Math.min(sidePanelWidth, viewportWidth - sidePanelViewportGutter);
		assert.equal(getKanbanPanelWidthLimits(viewportWidth).minWidth, expectedWidth);
	}
});

test('compact viewports keep the panel within the viewport without offering an impossible resize', () => {
	assert.deepEqual(getKanbanPanelWidthLimits(400), { minWidth: 376, maxWidth: 376 });
});

test('session count grows with available width across common desktop viewport widths', () => {
	const expectedSessionCounts = new Map([
		[1280, 3], [1366, 3], [1536, 3], [1920, 4], [2560, 4],
	]);
	let previousCount = 0;
	for (const [viewportWidth, expectedCount] of expectedSessionCounts) {
		const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
		const stops = getKanbanPanelSnapPoints(minWidth, maxWidth);

		assert.equal(stops.length, expectedCount, `viewport ${viewportWidth}px`);
		assert.ok(stops.length >= previousCount, `session count should not fall at ${viewportWidth}px`);
		assert.equal(stops[0], minWidth);
		assert.equal(stops.at(-1), maxWidth);
		assert.equal(viewportWidth - 2 - sidePanelWidth - stops.at(-1), 16);
		previousCount = stops.length;
	}
});

test('narrow windows have fewer sessions and their final stop preserves the 16px gap', () => {
	const viewportWidth = 900;
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	const stops = getKanbanPanelSnapPoints(minWidth, maxWidth);

	assert.deepEqual(stops, [minWidth, maxWidth]);
	assert.deepEqual(stops.map(width => getKanbanLayoutColumnCount(getKanbanPanelStage(width, viewportWidth))), [1, 1]);
	assert.equal(viewportWidth - 2 - sidePanelWidth - stops.at(-1), 16);
});

test('session widths scale with available window space and keep a discrete endpoint', () => {
	const stops1280 = getKanbanPanelSnapPoints(...Object.values(getKanbanPanelWidthLimits(1280)));
	const stops1920 = getKanbanPanelSnapPoints(...Object.values(getKanbanPanelWidthLimits(1920)));

	assert.deepEqual(stops1280, [420, 631, 842]);
	assert.deepEqual(stops1920, [420, 774, 1128, 1482]);
	assert.ok(stops1920[1] > stops1280[1]);
});

test('shrinking below a selected stage jumps to the previous available session and does not restore on widening', () => {
	const wider = resizeKanbanPanelForViewport(1482, 5, 1920, 1919);

	assert.deepEqual(wider, { width: 1127, stage: 4 });
	assert.deepEqual(resizeKanbanPanelForViewport(wider.width, wider.stage, 1919, 1920), wider);
});

test('a stage that no longer fits steps back rather than tracking each window pixel', () => {
	assert.deepEqual(resizeKanbanPanelForViewport(1128, 4, 1920, 1280), { width: 631, stage: 2 });
	assert.deepEqual(resizeKanbanPanelForViewport(1482, 5, 1920, 1280), { width: 842, stage: 4 });
});

test('resize widths snap to discrete stops including the minimum and responsive maximum', () => {
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(1920);
	const stops = getKanbanPanelSnapPoints(minWidth, maxWidth);

	assert.deepEqual(stops, [420, 774, 1128, 1482]);
	assert.equal(snapKanbanPanelWidth(600, 1920), 774);
	assert.equal(snapKanbanPanelWidth(1800, 1920), maxWidth);
	assert.equal(snapKanbanPanelWidth(100, 1920), minWidth);
	assert.equal(snapKanbanPanelWidth(596, 1920), 420);
	assert.equal(snapKanbanPanelWidth(598, 1920), 774);
});

test('wider viewport offers more and larger sessions than a narrow viewport', () => {
	const viewportWidth = 1920;
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	const stops = getKanbanPanelSnapPoints(minWidth, maxWidth);
	const narrowLimits = getKanbanPanelWidthLimits(1280);
	const narrowStops = getKanbanPanelSnapPoints(narrowLimits.minWidth, narrowLimits.maxWidth);

	assert.equal(stops.length, 4);
	assert.ok(stops.length > narrowStops.length);
	assert.ok(stops[1] > narrowStops[1]);
});
