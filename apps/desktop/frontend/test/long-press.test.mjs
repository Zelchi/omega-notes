import assert from 'node:assert/strict';
import test from 'node:test';
import { createLongPress } from '../src/features/change-preferences/model/long-press.ts';

test('long press triggers after three seconds and consumes the following click', t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let triggered = 0;
	const press = createLongPress(() => { triggered++; });

	press.start();
	t.mock.timers.tick(2999);
	assert.equal(triggered, 0);
	t.mock.timers.tick(1);
	assert.equal(triggered, 1);
	assert.equal(press.consume(), true);
	assert.equal(press.consume(), false);
});

test('releasing before three seconds cancels the long press', t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let triggered = false;
	const press = createLongPress(() => { triggered = true; });

	press.start();
	t.mock.timers.tick(2999);
	press.cancel();
	t.mock.timers.tick(1);
	assert.equal(triggered, false);
	assert.equal(press.consume(), false);
});
