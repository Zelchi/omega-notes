import assert from 'node:assert/strict';
import test from 'node:test';
import {
	clampVaultPage, filterVaultsByName, getVaultPageCount, getVaultPageForSelection,
	getVaultPageItems, parseVaultPageInput,
} from '../src/features/manage-vault/ui/vault-dialog/list-pagination.ts';

const vaults = [
	{ id: 'one', name: 'Alpha' },
	{ id: 'two', name: 'Beta' },
	{ id: 'three', name: 'Alphabet' },
	{ id: 'four', name: 'Gamma' },
	{ id: 'five', name: 'Delta' },
];

test('vault search trims and folds case without reordering matches', () => {
	assert.deepEqual(filterVaultsByName(vaults, ' ALP '), [vaults[0], vaults[2]]);
	assert.deepEqual(filterVaultsByName(vaults, '   '), vaults);
});

test('vault pages clamp size and page bounds while preserving list order', () => {
	assert.equal(getVaultPageCount(0, 0), 1);
	assert.equal(getVaultPageCount(vaults.length, 2), 3);
	assert.deepEqual(getVaultPageItems(vaults, 1, 2), [vaults[2], vaults[3]]);
	assert.deepEqual(getVaultPageItems(vaults, 2, 2), [vaults[4]]);
	assert.equal(clampVaultPage(-2, 3), 0);
	assert.equal(clampVaultPage(8, 3), 2);
	assert.equal(clampVaultPage(8, 0), 0);
});

test('the page containing the selected vault is revealed after filtering and resizing', () => {
	const filtered = filterVaultsByName(vaults, 'a');
	assert.equal(getVaultPageForSelection(filtered, 'four', 2), 1);
	assert.equal(getVaultPageForSelection(filtered, 'missing', 2), 0);
	assert.equal(getVaultPageForSelection(filtered, 'four', 0), 3);
});

test('page input accepts only an in-range integer and converts it to a zero-based index', () => {
	assert.equal(parseVaultPageInput('3', 3), 2);
	for (const value of ['', '0', '4', '1.5', 'NaN']) {
		assert.equal(parseVaultPageInput(value, 3), undefined);
	}
});
