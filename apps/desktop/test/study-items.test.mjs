import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { useStudies } from '../src/features/study-notes/model/controller.ts';
import { readStudyPreferences } from '../src/features/study-notes/api/preferences.repository.ts';
import { note, noteSummary, deferred, settle } from './helpers.mjs';

const material = call => {
    const kind = JSON.parse(call.prompt.split('Task settings: ')[1].split('\n')[0]).kind;
    const item = call.context.items[0];
    const sources = [...item.sourceIds];
    const base = { itemId: item.itemId, sources: ['N' + (sources.indexOf(item.noteId) + 1)], explanation: 'Source evidence' };
    const value = kind === 'quiz'
        ? { ...base, question: 'Question ' + item.itemId, answer: 'Right', distractors: ['Wrong1', 'Wrong2', 'Wrong3'] }
        : kind === 'cloze'
            ? { ...base, parts: ['The subject ' + item.itemId + ' is ', { answers: ['concept'] }, '.'] }
            : kind === 'correction'
                ? { ...base, segments: [
                    { text: 'Subject ' + item.itemId + '. ', incorrect: false },
                    { text: 'It is wrong. ', incorrect: true, correction: 'It is right. ' },
                    { text: 'Another fact.', incorrect: false },
                ] }
                : { ...base, question: 'Question ' + item.itemId, answer: 'Right' };
    return JSON.stringify({ title: 'Material', items: [value] });
};
const sufficientSource = Array.from({ length: 3 }, (_, line) =>
    Array.from({ length: 10 }, (_, word) => `concept${line}${word} explained with careful detail`).join(' ')).join('\n');

const setup = async (t, reply = call => Promise.resolve(material(call))) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = new Map(), calls = [], notes = [note('a', sufficientSource), note('b', sufficientSource)];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
        key: index => [...storage.keys()][index] ?? null,
        get length() { return storage.size; },
    } });
    let study;
    createRoot(dispose => {
        t.after(() => { dispose(); if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
        const [vault] = createSignal('vault-a');
        const [enabled] = createSignal(true);
        study = useStudies({
            vaultId: vault,
            notes: () => notes,
            loadAllNotes: async () => notes,
            noteSummaries: () => notes.map(noteSummary),
            currentNote: () => notes[0],
            aiEnabled: enabled,
            normalAiMode: () => true,
            aiConnected: () => true,
            canGenerate: () => true,
            onConnect: () => {},
            onOpenNote: () => {},
            describeAiError: failure => failure.message,
            t: key => key === 'locale' ? 'en' : key,
            requestText: (prompt, signal, context, purpose) => {
                const call = { prompt, signal, context, purpose };
                calls.push(call);
                return reply(call);
            },
        });
    });
    await settle();
    const waitFor = async condition => {
        for (let attempt = 0; attempt < 30; attempt++) {
            await settle();
            if (condition()) return;
        }
        throw Error('Condition was not reached');
    };
    const generate = async kind => {
        study.show(kind);
        await waitFor(() => !study.loading());
        await study.generate();
        await waitFor(() => study.stage() === 'setup' && !study.loading());
    };
    return { study, storage, calls, generate, waitFor };
};

test('generation saves one titled item per request and suffixes repeated titles', async t => {
    const f = await setup(t);
    f.study.show('quiz');
    await f.waitFor(() => !f.study.loading());
    f.study.setCount(20);
    await f.study.generate();
    await f.study.generate();

    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.context.items.length === 1));
    assert.deepEqual(f.study.saved().map(item => item.itemCount), [1, 1]);
    assert.deepEqual(f.study.saved().map(item => item.title).sort(), ['Material', 'Material #2']);
    assert.equal([...f.storage.keys()].filter(key => key.startsWith('omega-notes.studies.vault-a/quiz/')).length, 2);
});

test('generation loop can be stopped after the in-flight item finishes', async t => {
    const gates = [];
    const f = await setup(t, () => {
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
    });
    f.study.show('quiz');
    await f.waitFor(() => !f.study.loading());
    const first = f.study.generate();
    await f.waitFor(() => gates.length === 1);
    f.study.toggleGenerationLoop();
    gates[0].resolve(material(f.calls[0]));
    await first;
    await f.waitFor(() => gates.length === 2);
    assert.equal(f.study.saved().length, 1);
    f.study.toggleGenerationLoop();
    gates[1].resolve(material(f.calls[1]));
    await f.waitFor(() => f.study.stage() === 'setup' && f.study.saved().length === 2);
    assert.equal(f.study.generationLoopEnabled(), false);
});

test('returning to setup cancels generation and discards a late answer', async t => {
    const gate = deferred();
    const f = await setup(t, () => gate.promise);
    f.study.show('quiz');
    await f.waitFor(() => !f.study.loading());
    const generated = f.study.generate();
    await f.waitFor(() => f.calls.length === 1);
    f.study.setup();
    assert.equal(f.calls[0].signal.aborted, true);
    gate.resolve(material(f.calls[0]));
    await generated;
    await settle();
    assert.equal(f.study.stage(), 'setup');
    assert.equal(f.study.saved().length, 0);
});

test('study combines saved individual items only for the chosen practice', async t => {
    const f = await setup(t);
    await f.generate('quiz');
    await f.study.generate();
    f.study.setCount(5);
    await f.study.studyRandom();
    await f.waitFor(() => f.study.stage() === 'running');

    assert.equal(f.study.deck().items.length, 2);
    assert.equal(f.study.sessionIndices().length, 2);
    assert.equal(f.study.saved().length, 2);
});

test('infinite quantity studies every saved item and infinite lives and time do not expire', async t => {
    const f = await setup(t);
    await f.generate('quiz');
    await f.study.generate();
    f.study.setCount('infinite');
    f.study.setLives('infinite');
    f.study.setSeconds('infinite');

    assert.deepEqual(readStudyPreferences('quiz'), { count: 'infinite', seconds: 'infinite', lives: 'infinite' });
    await f.study.studyRandom();
    await f.waitFor(() => f.study.stage() === 'running');
    assert.equal(f.study.sessionIndices().length, 2);
    assert.equal(f.study.remainingLives(), 'infinite');
    assert.equal(f.study.remainingTime(), 'infinite');

    const wrongChoice = (f.study.current().correctIndex + 1) % 4;
    f.study.answer(wrongChoice);
    assert.equal(f.study.remainingLives(), 'infinite');
    await f.waitFor(() => !f.study.savingProgress());
    f.study.next();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(f.study.index(), 1);
    assert.equal(f.study.remainingTime(), 'infinite');
});

test('manually ending a finite practice opens results before all items are answered', async t => {
    const f = await setup(t);
    await f.generate('quiz');
    await f.study.generate();
    await f.study.studyRandom();
    await f.waitFor(() => f.study.stage() === 'running');

    assert.equal(f.study.sessionIndices().length, 2);
    f.study.endStudy();

    assert.equal(f.study.stage(), 'result');
    assert.equal(f.study.endReason(), 'manual');
    assert.equal(f.study.correct(), 0);
});

test('manually ending a one-item quiz opens results instead of returning to setup', async t => {
    const f = await setup(t);
    await f.generate('quiz');
    await f.study.studyRandom();
    await f.waitFor(() => f.study.stage() === 'running');

    f.study.endStudy();

    assert.equal(f.study.stage(), 'result');
    assert.equal(f.study.endReason(), 'manual');
});

test('manually ending written practice waits for queued AI grading before showing results', async t => {
    const grading = deferred();
    const f = await setup(t, call => call.purpose === 'study-evaluation' ? grading.promise : Promise.resolve(material(call)));
    await f.generate('written');
    await f.study.generate();
    await f.study.studyRandom();
    await f.waitFor(() => f.study.stage() === 'running');

    f.study.review.submit('My answer');
    await f.waitFor(() => f.calls.some(call => call.purpose === 'study-evaluation'));
    assert.equal(f.study.index(), 1);
    f.study.endStudy();
    assert.equal(f.study.stage(), 'grading');

    grading.resolve(JSON.stringify({ correct: true, summary: 'Review', strengths: [], gaps: [], corrections: [] }));
    await f.waitFor(() => f.study.stage() === 'result');
    assert.equal(f.study.correct(), 1);
    assert.equal(f.study.endReason(), 'manual');
});
