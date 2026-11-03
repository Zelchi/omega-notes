import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldHideWindow } from '../src/app/model/window-visibility.ts';

test('windows only hide other windows in their own category', () => {
	const categories = {
		left: ['kanban', 'pomodoro'],
		right: ['chat'],
		modal: ['settings', 'vault', 'study', 'note-name', 'delete'],
	};
	const windows = Object.entries(categories).flatMap(([category, entries]) => entries.map(window => ({ category, window })));

	for (const keep of windows) {
		for (const candidate of windows) {
			assert.equal(
				shouldHideWindow(keep.window, candidate.window),
				keep.category === candidate.category && keep.window !== candidate.window,
				`keeping ${keep.window} should ${keep.category === candidate.category && keep.window !== candidate.window ? "hide" : "preserve"} ${candidate.window}`,
			);
		}
	}
});
