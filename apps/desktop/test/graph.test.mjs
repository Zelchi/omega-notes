import test from 'node:test';
import assert from 'node:assert/strict';
import { graphEdges } from '../src/pages/canvas/lib/graph.ts';
import { readGraphState } from '../src/pages/canvas/api/graph.repository.ts';
import { mapTextOutsideCode } from '../src/shared/lib/formatted-text.ts';
import { recordNavigation, createNavigationHistory, findHistoryIndex } from '../src/app/model/navigation-history.ts';
import { note } from './helpers.mjs';

for (const prose of ['`[[b]]`', '```md\n[[b]]\n```', '~~~md\n[[b]]\n~~~', '[[b\n]]']) {
    test('literal or invalid references do not create graph edges: ' + JSON.stringify(prose), () => {
        assert.equal(graphEdges([note('a', prose), note('b')]).length, 0);
    });
}
test('graph resolves IDs and aliases and deduplicates reverse connections', () => {
    const a = note('a', '[[b|Alias]] [[b]]'), b = note('b', '[[a]]');
    assert.equal(graphEdges([a, b]).length, 1);
});
test('graph resolves titles and skips missing and self references', () => {
    const a = note('a', '[[Note B]] [[missing]] [[a]]'), b = { ...note('b'), title: 'Note B' };
    assert.equal(graphEdges([a, b]).length, 1);
});
for (const scale of [0, -1, null, '1', 10]) test('stored camera rejects invalid scale: ' + scale, t => {
    const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
    globalThis.window = {}; globalThis.localStorage = { getItem: () => JSON.stringify({ positions: {}, view: { x: 0, y: 0, scale } }) };
    t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
        if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage; });
    assert.equal(readGraphState("vault-a").view, undefined);
});
test('code mapping preserves fences and transforms only prose', () => {
    const content = 'hi `code`\n~~~js\nprotected\n~~~~\nbye';
    assert.equal(mapTextOutsideCode(content, text => text.toUpperCase()), 'HI `code`\n~~~js\nprotected\n~~~~\nBYE');
});
test('history discards forward branch and skips deleted notes', () => {
    let history = createNavigationHistory();
    for (const noteId of ['a', 'b', 'c']) history = recordNavigation(history, { route: 'note', noteId });
    assert.equal(findHistoryIndex(history, -1, new Set(['a', 'c'])), 0);
    history = recordNavigation({ ...history, index: 0 }, { route: 'note', noteId: 'd' });
    assert.deepEqual(history.entries.map(entry => entry.noteId), ['a', 'd']);
});
test('history caps entries and ignores repeated destination', () => {
    let history = createNavigationHistory();
    for (let i = 0; i < 250; i++) history = recordNavigation(history, { route: 'note', noteId: String(i) });
    assert.equal(history.entries.length, 200); assert.equal(history.entries[0].noteId, '50');
    assert.equal(recordNavigation(history, { route: 'note', noteId: '249' }), history);
});
for (const fence of ['```', '~~~']) test('unclosed code fence protects the remaining text: ' + fence, () => {
    assert.equal(mapTextOutsideCode('before\n' + fence + '\ntext', value => value.toUpperCase()), 'BEFORE\n' + fence + '\ntext');
});
test('a different fence marker does not close a code block', () => {
    const value = '~~~\n```\n[[b]]\n~~~\n[[b]]';
    assert.equal(mapTextOutsideCode(value, prose => prose.replaceAll('[[b]]', 'LINK')), '~~~\n```\n[[b]]\n~~~\nLINK');
});
