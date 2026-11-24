import assert from 'node:assert/strict';
import test from 'node:test';
import { retainExitingMessage } from '../src/shared/ui/delete-confirmation-dialog/message.ts';

test('delete confirmation uses the current message while open and retains it during exit', () => {
	assert.equal(retainExitingMessage(true, 'Delete this vault?', undefined), 'Delete this vault?');
	assert.equal(retainExitingMessage(true, 'Delete this note?', 'Old message'), 'Delete this note?');
	assert.equal(retainExitingMessage(false, 'Fallback', 'Delete this note?'), 'Delete this note?');
	assert.equal(retainExitingMessage(false, 'Fallback', undefined), 'Fallback');
});
