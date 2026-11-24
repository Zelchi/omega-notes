import assert from 'node:assert/strict';
import test from 'node:test';
import { handleVaultActionsBackgroundClick } from '../src/features/manage-vault/ui/vault-dialog/action-click.ts';

test('vault action hit area toggles only when the background itself is clicked', () => {
	const currentTarget = {};
	const childTarget = {};
	let toggles = 0;
	const onToggle = () => { toggles++; };

	assert.equal(handleVaultActionsBackgroundClick({ target: currentTarget, currentTarget }, onToggle), true);
	assert.equal(toggles, 1);
	assert.equal(handleVaultActionsBackgroundClick({ target: childTarget, currentTarget }, onToggle), false);
	assert.equal(toggles, 1);
});
