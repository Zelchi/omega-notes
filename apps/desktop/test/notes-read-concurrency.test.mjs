import test from 'node:test';
import assert from 'node:assert/strict';
import { withDocumentReadSlot } from '../src/entities/note/model/document-read-limiter.ts';
import { deferred } from './helpers.mjs';

test('limits overlapping document read callers to four active reads', async () => {
    let active = 0, peak = 0, completed = 0;
    const gate = deferred(), fourStarted = deferred();
    const read = () => withDocumentReadSlot(async () => {
        active++;
        peak = Math.max(peak, active);
        if (active === 4) fourStarted.resolve();
        await gate.promise;
        active--;
        completed++;
    });

    const firstCaller = Array.from({ length: 6 }, read);
    const secondCaller = Array.from({ length: 6 }, read);
    await fourStarted.promise;
    assert.equal(active, 4);
    gate.resolve();
    await Promise.all([...firstCaller, ...secondCaller]);

    assert.equal(peak, 4);
    assert.equal(completed, 12);
});
