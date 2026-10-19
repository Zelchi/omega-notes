import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { note, deferred, settle } from './helpers.mjs';
import { useStudyRequestQueue } from '../src/features/study-notes/model/request-queue.ts';
import { useAnswerReview } from '../src/features/study-notes/model/answer-review.controller.ts';

const queueSetup = t => {
    const calls = []; let request, setVault, setEnabled, setReady;
    createRoot(dispose => {
        t.after(dispose);
        const [vault, updateVault] = createSignal('vault-a'); setVault = updateVault;
        const [enabled, updateEnabled] = createSignal(true); setEnabled = updateEnabled;
        const [ready, updateReady] = createSignal(true); setReady = updateReady;
        request = useStudyRequestQueue({ vaultId: vault, aiEnabled: enabled, aiConnected: () => true, canGenerate: ready,
            requestText: (prompt, signal, context, purpose) => {
                const result = deferred(); calls.push({ prompt, signal, context, purpose, ...result }); return result.promise;
            } });
    });
    return { request, calls, setVault, setEnabled, setReady };
};
test('study queue admits one request at a time and preserves its context and purpose', async t => {
    const f = queueSetup(t), signal = new AbortController().signal;
    const context = { items: [] };
    const first = f.request('first', signal, context, 'study-generation'), second = f.request('second', signal);
    await settle(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].context, context);
    assert.equal(f.calls[0].purpose, 'study-generation');
    f.calls[0].resolve('one'); assert.equal(await first, 'one'); await settle();
    assert.equal(f.calls.length, 2); f.calls[1].resolve('two'); assert.equal(await second, 'two');
});
test('cancelling a waiting study request prevents it from reaching the provider', async t => {
    const f = queueSetup(t), token = new AbortController(); f.setReady(false);
    const request = f.request('waiting', token.signal), rejected = assert.rejects(request, /AI_CANCELLED/);
    token.abort(); await rejected; f.setReady(true); await settle(); assert.equal(f.calls.length, 0);
});
for (const action of ['vault', 'disable']) test(`study queue cancels active and waiting requests on ${action}`, async t => {
    const f = queueSetup(t), signal = new AbortController().signal;
    const first = f.request('first', signal), second = f.request('second', signal);
    const rejected = Promise.all([assert.rejects(first, /AI_CANCELLED/), assert.rejects(second, /AI_CANCELLED/)]);
    if (action === 'vault') f.setVault('vault-b'); else f.setEnabled(false);
    await rejected; assert.equal(f.calls[0].signal.aborted, true);
    f.calls[0].resolve('late'); await settle(); assert.equal(f.calls.length, 1);
});

const reviewSetup = t => {
    const calls = [], results = []; let review, setVisible, currentIndex = 0;
    const notes = [note('a', 'Source material')];
    const items = Array.from({ length: 3 }, (_, index) => ({ question: 'Question ' + index, answer: 'Reference', sources: ['a'], options: [], explanation: '' }));
    createRoot(dispose => {
        t.after(dispose);
        const [visible, updateVisible] = createSignal(true); setVisible = updateVisible;
        review = useAnswerReview({ vaultId: () => 'vault-a', notes: () => notes, aiConnected: () => true,
            canGenerate: () => true, t: key => key, describeAiError: failure => failure.message,
            requestText: (prompt, signal) => { const result = deferred(); calls.push({ signal, ...result }); return result.promise; } }, {
            active: () => true, canWrite: visible, current: () => items[currentIndex], itemIndex: () => currentIndex,
            pauseTimer: () => 1000, onSubmitted: () => { currentIndex++; }, prompt: () => 'Evaluate',
            onResult: (...args) => results.push(args),
        });
    });
    return { review, calls, results, setVisible };
};
const feedback = correct => JSON.stringify({ correct, summary: 'Review', strengths: [], gaps: [], corrections: [] });
test('answer reviews continue while the modal is hidden and preserve the original question index', async t => {
    const f = reviewSetup(t); f.review.submit('Answer one'); f.review.submit('Answer two');
    assert.equal(f.calls.length, 1); assert.equal(f.review.pending(), 2); f.setVisible(false);
    f.calls[0].resolve(feedback(true)); await settle(); assert.equal(f.calls.length, 2);
    f.calls[1].resolve(feedback(false)); await settle();
    assert.deepEqual(f.results.map(result => result.slice(0, 2)), [[0, 'correct'], [1, 'wrong']]);
    assert.equal(f.review.pending(), 0);
});
test('technical grading failure does not score a wrong answer and retry only resends the failed review', async t => {
    const f = reviewSetup(t); f.review.submit('Answer one'); f.calls[0].resolve(feedback(true)); await settle();
    f.review.submit('Answer two'); f.calls[1].reject(Error('AI_TIMEOUT')); await settle();
    assert.equal(f.results.length, 1); assert.equal(f.review.failed(), true);
    f.review.retry(); assert.equal(f.calls.length, 3); f.calls[2].resolve(feedback(true)); await settle();
    assert.deepEqual(f.results.map(result => result[0]), [0, 1]); assert.equal(f.review.failed(), false);
});
test('reset aborts an answer review and ignores a late result', async t => {
    const f = reviewSetup(t); f.review.submit('Answer'); f.review.reset();
    assert.equal(f.calls[0].signal.aborted, true); f.calls[0].resolve(feedback(true)); await settle();
    assert.equal(f.results.length, 0); assert.deepEqual(f.review.responses(), []);
});
test('invalid grading output remains retryable without changing the score', async t => {
    const f = reviewSetup(t); f.review.submit('Answer'); f.calls[0].resolve('not JSON'); await settle();
    assert.equal(f.results.length, 0); assert.equal(f.review.failed(), true); assert.equal(f.review.pending(), 1);
});
test('skipped and timed out answers are recorded without calling AI', t => {
    const f = reviewSetup(t); f.review.skip(); f.review.timeout();
    assert.deepEqual(f.results.map(result => result.slice(0, 2)), [[0, 'skipped'], [1, 'timeout']]);
    assert.equal(f.calls.length, 0);
});
