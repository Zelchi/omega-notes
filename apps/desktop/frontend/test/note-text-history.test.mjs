import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextHistory, invalidateHistoryForExternalText } from '../src/features/undo-note-edit/index.ts';

const state = text => ({ text, selection: { start: text.length, end: text.length }, scrollTop: 0 });

test('external text replacement clears incompatible history and pending snapshots, but a local echo does not', () => {
    const history = createTextHistory();
    const initial = state('initial');
    const local = state('local edit');
    history.record(initial, local, 'insertText');

    let pendingHistory = local;
    let pendingHistoryKind = 'insertText';
    const clearPending = () => {
        pendingHistory = undefined;
        pendingHistoryKind = 'replace';
    };

    assert.equal(invalidateHistoryForExternalText(history, local.text, local.text, clearPending), false);
    assert.equal(pendingHistory, local);
    assert.equal(pendingHistoryKind, 'insertText');
    assert.equal(history.undo()?.text, initial.text);
    assert.equal(history.redo()?.text, local.text);
    assert.equal(history.undo()?.text, initial.text);
    pendingHistory = initial;

    assert.equal(invalidateHistoryForExternalText(history, 'external update', initial.text, clearPending), true);
    assert.equal(pendingHistory, undefined);
    assert.equal(pendingHistoryKind, 'replace');
    assert.equal(history.undo(), undefined);
    assert.equal(history.redo(), undefined);

    const external = state('external update');
    const nextLocalEdit = state('external update, edited locally');
    history.record(external, nextLocalEdit, 'insertText');
    assert.equal(history.undo()?.text, external.text);
    assert.equal(history.redo()?.text, nextLocalEdit.text);
});

test('undo and redo restore selection, scroll position, and paragraph alignment with the text', () => {
    const history = createTextHistory();
    const before = {
        text: 'first line\nsecond line',
        paragraphAlignments: ['left', 'center'],
        selection: { start: 2, end: 7 },
        scrollTop: 120,
    };
    const after = {
        text: 'first line\nsecond line!',
        paragraphAlignments: ['right', 'center'],
        selection: { start: 4, end: 4 },
        scrollTop: 180,
    };

    history.record(before, after, 'format');
    assert.deepEqual(history.undo(), before);
    assert.deepEqual(history.redo(), after);
});

test('typing edits with a continuous caret group into one undo checkpoint', () => {
    const history = createTextHistory();
    const initial = state('a');
    const first = { ...state('ab'), selection: { start: 2, end: 2 } };
    const second = { ...state('abc'), selection: { start: 3, end: 3 } };

    history.record(initial, first, 'insertText');
    history.record(first, second, 'insertText');
    assert.deepEqual(history.undo(), initial);
    assert.deepEqual(history.redo(), second);
});
