import assert from 'node:assert/strict';
import test from 'node:test';
import {
	clampPdfLibraryPage, createPdfLibraryPageJumpController, createPdfLibrarySearchInputHandler, filterPdfDocuments,
	getPdfLibraryPageCount, getPdfLibraryPageItems,
	getPdfLibraryPageSize, parsePdfLibraryPageInput,
} from '../src/features/manage-pdfs/model/library-pagination.ts';

const documents = [
	{ id: 'one', title: 'Alpha Notes' },
	{ id: 'two', title: 'Beta' },
	{ id: 'three', title: 'Alphabets' },
	{ id: 'four', title: 'Gamma' },
	{ id: 'five', title: 'Delta' },
];

test('PDF library search trims and folds case while retaining document order', () => {
	assert.deepEqual(filterPdfDocuments(documents, ' ALPHA '), [documents[0], documents[2]]);
	assert.deepEqual(filterPdfDocuments(documents, '  '), documents);
});

test('changing the PDF library search stores the query and returns pagination to the first page', () => {
	const calls = [];
	const updateSearch = createPdfLibrarySearchInputHandler(
		value => calls.push(['search', value]),
		page => calls.push(['page', page]),
	);
	updateSearch({ currentTarget: { value: 'Beta' } });

	assert.deepEqual(calls, [['search', 'Beta'], ['page', 0]]);
});

test('available list height determines a positive page size with the existing card spacing', () => {
	assert.equal(getPdfLibraryPageSize(0), 1);
	assert.equal(getPdfLibraryPageSize(81), 1);
	assert.equal(getPdfLibraryPageSize(82), 1);
	assert.equal(getPdfLibraryPageSize(172), 2);
	assert.equal(getPdfLibraryPageSize(262), 3);
});

test('PDF library pagination preserves order and clamps pages after filtering or resizing', () => {
	assert.equal(getPdfLibraryPageCount(0, 0), 1);
	assert.equal(getPdfLibraryPageCount(documents.length, 2), 3);
	assert.deepEqual(getPdfLibraryPageItems(documents, 1, 2), [documents[2], documents[3]]);
	assert.deepEqual(getPdfLibraryPageItems(documents, 2, 2), [documents[4]]);
	assert.equal(clampPdfLibraryPage(-1, 3), 0);
	assert.equal(clampPdfLibraryPage(8, 3), 2);
	assert.equal(clampPdfLibraryPage(8, 0), 0);
});

test('PDF library page input accepts only an in-range integer', () => {
	assert.equal(parsePdfLibraryPageInput('3', 3), 2);
	for (const value of ['', '0', '4', '1.5', '-2', 'NaN']) {
		assert.equal(parsePdfLibraryPageInput(value, 3), undefined);
	}
});

test('PDF library page jump opens with the current page, commits valid input, and closes invalid input', () => {
	const state = { page: 2, pageCount: 5, open: false, value: '' };
	const jump = createPdfLibraryPageJumpController({
		page: () => state.page,
		pageCount: () => state.pageCount,
		pageJumpOpen: () => state.open,
		pageJumpValue: () => state.value,
		setPageJumpOpen: value => { state.open = value; },
		setPageJumpValue: value => { state.value = value; },
		setPage: value => { state.page = value; },
	});

	jump.open();
	assert.deepEqual(state, { page: 2, pageCount: 5, open: true, value: '3' });
	state.value = '5';
	jump.goToPage();
	assert.deepEqual(state, { page: 4, pageCount: 5, open: false, value: '5' });

	jump.open();
	state.value = '8';
	jump.goToPage();
	assert.deepEqual(state, { page: 4, pageCount: 5, open: false, value: '8' });
	jump.goToPage();
	assert.equal(state.page, 4);
});
