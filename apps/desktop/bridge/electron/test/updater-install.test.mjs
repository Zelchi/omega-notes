import test from 'node:test';
import assert from 'node:assert/strict';
import { installAndRelaunch } from '../updater-install.mjs';

test('relaunches and quits after a successful update installation', async () => {
    const calls = [];
    await installAndRelaunch(
        async () => calls.push('install'),
        () => calls.push('relaunch'),
        async () => calls.push('quit'),
    );
    assert.deepEqual(calls, ['install', 'relaunch', 'quit']);
});

test('does not relaunch or quit when update installation fails', async () => {
    const calls = [];
    await assert.rejects(installAndRelaunch(
        async () => { calls.push('install'); throw new Error('install failed'); },
        () => calls.push('relaunch'),
        async () => calls.push('quit'),
    ), /install failed/);
    assert.deepEqual(calls, ['install']);
});
