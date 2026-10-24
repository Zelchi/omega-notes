import test from 'node:test';
import assert from 'node:assert/strict';
import { Channel, invoke, listen } from '../../src/shared/lib/desktop.ts';

test('renderer channels cross a serializable bridge and subscriptions can be removed', async t => {
    const previous = globalThis.window;
    let receive;
    const listeners = new Set();
    globalThis.window = { omegaDesktop: {
        onChannel(callback) { receive = callback; return () => {}; },
        onEvent(callback) { listeners.add(callback); return () => listeners.delete(callback); },
        async invoke(command, args) {
            assert.equal(command, 'stream_note_summaries');
            assert.ok(args.output.__omegaChannel);
            receive(args.output.__omegaChannel, { text: 'first' });
            return 42;
        },
    } };
    t.after(() => { globalThis.window = previous; });
    const channel = new Channel();
    const messages = [];
    channel.onmessage = value => messages.push(value);
    assert.equal(await invoke('stream_note_summaries', { output: channel }), 42);
    assert.deepEqual(messages, [{ text: 'first' }]);
    receive(channel.id, { text: 'after completion' });
    assert.equal(messages.length, 1);
    const unlisten = await listen('ai-event', event => messages.push(event.payload));
    for (const listener of listeners) listener('ai-event', { text: 'event' });
    unlisten();
    assert.equal(listeners.size, 0);
    assert.equal(messages.length, 2);
});
