import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useStudies } from '../src/features/study-notes/model/controller.ts';
import { note, deferred, settle } from './helpers.mjs';

const material = (call) => {
    const kind = JSON.parse(call.prompt.split('Task settings: ')[1].split('\n')[0]).kind;
    const ids = [...new Set(call.context.items.flatMap(item => item.sourceIds))];
    return JSON.stringify({ title: 'Material', items: call.context.items.map(item => {
        const base = { itemId: item.itemId, sources: ['N' + (ids.indexOf(item.noteId) + 1)], explanation: 'Source evidence' };
        if (kind === 'cloze') return { ...base, parts: ['The subject ' + item.itemId + ' is ', { answers: ['concept'] }, '.'] };
        if (kind === 'correction') return { ...base, segments: [
            { text: 'Subject ' + item.itemId + '. ', incorrect: false },
            { text: 'It is wrong. ', incorrect: true, correction: 'It is right. ' },
            { text: 'Another fact.', incorrect: false },
        ] };
        return { ...base, question: 'Question ' + item.itemId, answer: 'Right', ...(kind === 'quiz' ? { distractors: ['Wrong1', 'Wrong2', 'Wrong3'] } : {}) };
    }) });
};
const setup = async (t, reply = call => material(call)) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), storage = new Map(), calls = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key), key: index => [...storage.keys()][index] ?? null, get length() { return storage.size; },
    } });
    let study, setVault, setEnabled, setCurrent;
    const notes = [note('a', 'The subject has real source content'), note('b', 'Another subject')];
    createRoot(dispose => {
        t.after(() => { dispose(); if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
        const [vault, updateVault] = createSignal('vault-a'); setVault = updateVault;
        const [enabled, updateEnabled] = createSignal(true); setEnabled = updateEnabled;
        const [current, updateCurrent] = createSignal(notes[0]); setCurrent = updateCurrent;
        study = useStudies({ vaultId: vault, notes: () => notes, currentNote: current,
            aiEnabled: enabled, aiConnected: () => true, canGenerate: () => true, onConnect: () => {},
            onOpenNote: setCurrent, describeAiError: failure => failure.message, t: key => key === 'locale' ? 'en' : key,
            requestText: (prompt, signal, context, purpose) => { const call = { prompt, signal, context, purpose }; calls.push(call); return Promise.resolve(reply(call)); },
        });
    });
    await settle();
    const start = async kind => { study.show(kind); study.setCount(5); await study.generate(); await settle(); assert.equal(study.error(), undefined); assert.equal(study.stage(), 'running'); };
    return { study, start, storage, calls, setVault, setEnabled, setCurrent };
};
for (const kind of ['flashcards', 'quiz', 'written', 'cloze', 'correction']) test(`full session generates, persists, closes and resumes ${kind}`, async t => {
    const f = await setup(t); await f.start(kind);
    const id = f.study.deck().id;
    assert.equal(f.study.deck().items.length, 5);
    assert.ok(f.storage.has(`omega-notes.studies.vault-a/${kind}/${id}.json`));
    f.study.close(); assert.equal(f.study.open(), false); f.study.show(kind);
    assert.equal(f.study.deck().id, id); assert.equal(f.study.stage(), 'running');
    assert.equal(f.study.open(), true); assert.equal(f.calls.length, 1);
});
test('closing during generation preserves work and material starts while hidden', async t => {
    const gate = deferred(); let pending;
    const f = await setup(t, call => { pending = call; return gate.promise; });
    f.study.show('quiz'); f.study.setCount(5); const generated = f.study.generate(); await settle();
    assert.equal(f.study.stage(), 'generating'); f.study.close(); gate.resolve(material(pending));
    await generated; await settle(); assert.equal(f.study.stage(), 'running'); assert.equal(f.study.open(), false);
    f.study.show('quiz'); assert.equal(f.study.deck().items.length, 5);
});
test('Home cancels generation and rejects a late material without saving a session', async t => {
    const gate = deferred(); let pending;
    const f = await setup(t, call => { pending = call; return gate.promise; });
    f.study.show('quiz'); const generated = f.study.generate(); await settle();
    f.study.setup(); assert.equal(pending.signal.aborted, true); gate.resolve(material(pending));
    await generated; await settle(); assert.equal(f.study.stage(), 'setup'); assert.equal(f.study.deck(), undefined);
    assert.equal([...f.storage.keys()].filter(key => key.startsWith('omega-notes.studies.')).length, 0);
});
test('hiding a session pauses its timer, then resumes the remaining time', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
    const f = await setup(t); await f.start('quiz');
    t.mock.timers.tick(5000); assert.equal(f.study.remainingTime(), 25);
    f.study.close(); t.mock.timers.tick(120_000); assert.equal(f.study.remainingTime(), 25);
    f.study.show('quiz'); t.mock.timers.tick(1000); assert.equal(f.study.remainingTime(), 24);
});
test('quiz progress is saved and reset without affecting another method', async t => {
    const f = await setup(t); await f.start('quiz'); const deck = f.study.deck();
    f.study.answer(f.study.current().correctIndex); assert.equal(await f.study.flushSave(), true); await settle();
    const key = `omega-notes.studies.vault-a/quiz/${deck.id}.json`;
    assert.equal(JSON.parse(f.storage.get(key)).progress.items[0].lastOutcome, 'correct');
    await f.study.clearProgress(f.study.deck()); assert.equal(JSON.parse(f.storage.get(key)).progress.items.length, 0);
    f.study.show('flashcards'); assert.equal(f.study.stage(), 'setup');
    f.study.show('quiz'); assert.equal(f.study.deck().id, deck.id);
});
for (const action of ['vault', 'disable']) test(`full session discards late generation on ${action}`, async t => {
    const gate = deferred(); let pending;
    const f = await setup(t, call => { pending = call; return gate.promise; });
    f.study.show('quiz'); const generated = f.study.generate(); await settle();
    if (action === 'vault') f.setVault('vault-b'); else f.setEnabled(false);
    assert.equal(pending.signal.aborted, true); gate.resolve(material(pending)); await generated; await settle();
    assert.equal(f.study.open(), false); assert.equal(f.study.stage(), 'setup');
    assert.equal([...f.storage.keys()].filter(key => key.startsWith('omega-notes.studies.')).length, 0);
});
for (const kind of ['written', 'cloze']) test(`full ${kind} session accepts all answers before grading and saves its final report while hidden`, async t => {
    const reviews = [];
    const f = await setup(t, call => {
        if (call.purpose === 'study-generation') return material(call);
        const pending = deferred(); reviews.push(pending); return pending.promise;
    });
    await f.start(kind);
    const id = f.study.deck().id;
    for (let index = 0; index < 5; index++) {
        if (kind === 'written') { f.study.review.setDraft('Right answer'); f.study.review.submit(); }
        else { f.study.cloze.setAnswer(0, 'concept'); f.study.cloze.submit(); }
        await settle();
    }
    assert.equal(f.study.stage(), 'grading'); assert.equal(f.study.review.pending(), 5);
    assert.equal(reviews.length, 1); assert.equal(f.study.remainingLives(), 3);
    f.study.close();
    for (let index = 0; index < 5; index++) {
        assert.equal(reviews.length, index + 1);
        reviews[index].resolve(JSON.stringify({ ...(kind === 'written' ? { correct: true } : { blankResults: [true] }),
            summary: 'Accurate meaning', strengths: [], gaps: [], corrections: [] }));
        await settle();
    }
    assert.equal(await f.study.flushSave(), true); await settle();
    const stored = JSON.parse(f.storage.get(`omega-notes.studies.vault-a/${kind}/${id}.json`));
    assert.equal(stored.progress.responses.length, 5);
    assert.ok(stored.progress.responses.every(response => response.outcome === 'correct' && response.feedback.correct));
    f.study.show(kind); assert.equal(f.study.stage(), 'result'); assert.equal(f.study.correct(), 5);
    assert.equal(f.study.review.pending(), 0);
});
test('method preferences survive Home and disabling then enabling AI', async t => {
    const f = await setup(t); f.study.show('cloze'); f.study.setCount(20); f.study.setSeconds(300); f.study.setLives(5);
    f.study.setup(); f.setEnabled(false); f.setEnabled(true); f.study.show('cloze');
    assert.deepEqual([f.study.count(), f.study.seconds(), f.study.lives()], [20, 300, 5]);
    assert.deepEqual(JSON.parse(f.storage.get('omega-notes.settings.studies.cloze')), { count: 20, seconds: 300, lives: 5 });
    f.study.show('written'); assert.deepEqual([f.study.count(), f.study.seconds(), f.study.lives()], [10, 30, 3]);
});
