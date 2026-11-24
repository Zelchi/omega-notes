import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createPdfReaderNavigationController, handlePdfReaderWheelPageNavigation,
} from '../src/features/manage-pdfs/model/reader-controls.ts';

const setup = (overrides = {}) => {
	const state = {
		pageCount: 8,
		pageNumber: 2,
		visiblePages: [1, 2],
		spreadEnabled: false,
		busy: false,
		pageJumpOpen: false,
		pageJumpValue: '',
	};
	const calls = [];
	const options = {
		pageCount: () => state.pageCount,
		pageNumber: () => state.pageNumber,
		visiblePages: () => state.visiblePages,
		spreadEnabled: () => state.spreadEnabled,
		busy: () => state.busy,
		pageJumpOpen: () => state.pageJumpOpen,
		pageJumpValue: () => state.pageJumpValue,
		setPageJumpOpen: value => { calls.push(['jumpOpen', value]); state.pageJumpOpen = value; },
		setPageJumpValue: value => { calls.push(['jumpValue', value]); state.pageJumpValue = value; },
		setPageNumber: update => {
			calls.push(['page']);
			state.pageNumber = update(state.pageNumber);
		},
		clearZoomAnchor: () => calls.push(['clearZoom']),
		clearSelectedHighlight: () => calls.push(['clearHighlight']),
		closeTextMenu: () => calls.push(['closeMenu']),
		clearBrowserSelection: () => calls.push(['clearSelection']),
		...overrides,
	};
	return {
		state,
		calls,
		navigation: createPdfReaderNavigationController(options),
	};
};

test('page navigation clears zoom and highlight selection state before moving', () => {
	const { navigation, state, calls } = setup({
		spreadEnabled: () => true,
	});

	navigation.movePage(1);

	assert.equal(state.pageNumber, 4);
	assert.deepEqual(calls, [
		['clearZoom'],
		['clearHighlight'],
		['closeMenu'],
		['clearSelection'],
		['page'],
	]);
});

test('Shift+wheel navigation stays within the first and last PDF pages', () => {
	const { navigation, state } = setup();
	const event = { shiftKey: true, deltaX: 0, deltaY: -1, preventDefault() {} };

	state.pageNumber = 1;
	handlePdfReaderWheelPageNavigation(event, state.pageCount, state.busy, navigation.movePage);
	assert.equal(state.pageNumber, 1);

	state.pageNumber = state.pageCount;
	event.deltaY = 1;
	handlePdfReaderWheelPageNavigation(event, state.pageCount, state.busy, navigation.movePage);
	assert.equal(state.pageNumber, state.pageCount);
});

test('page jump opens at the first visible page and does nothing while loading or empty', () => {
	const { navigation, state, calls } = setup({
		visiblePages: () => [3, 4],
	});

	navigation.openPageJump();
	assert.equal(state.pageJumpValue, '3');
	assert.equal(state.pageJumpOpen, true);

	calls.length = 0;
	state.busy = true;
	navigation.openPageJump();
	assert.deepEqual(calls, []);

	state.busy = false;
	state.pageCount = 0;
	navigation.openPageJump();
	assert.deepEqual(calls, []);
});

test('invalid page jump closes the field without clearing selection state or changing page', () => {
	const { navigation, state, calls } = setup();
	state.pageJumpOpen = true;
	state.pageJumpValue = '3.5';

	navigation.goToPage();

	assert.equal(state.pageJumpOpen, false);
	assert.equal(state.pageNumber, 2);
	assert.deepEqual(calls, [['jumpOpen', false]]);
});

test('valid page jump clears selection state and navigates to the requested page', () => {
	const { navigation, state, calls } = setup();
	state.pageJumpOpen = true;
	state.pageJumpValue = '6';

	navigation.goToPage();

	assert.equal(state.pageJumpOpen, false);
	assert.equal(state.pageNumber, 6);
	assert.deepEqual(calls, [
		['jumpOpen', false],
		['clearZoom'],
		['clearHighlight'],
		['closeMenu'],
		['clearSelection'],
		['page'],
	]);
});
