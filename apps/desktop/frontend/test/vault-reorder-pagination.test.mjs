import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeVisibleVaultOrder } from '../src/features/manage-vault/model/vault-reorder.ts';

test('reordering a page keeps every vault outside it in its original position', () => {
	assert.deepEqual(mergeVisibleVaultOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b', 'c']), ['a', 'd', 'b', 'c', 'e']);
});
