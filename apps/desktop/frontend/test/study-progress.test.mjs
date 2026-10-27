import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { studySummary, recordStudyOutcome } from '../src/entities/study/index.ts';
import { useStudies } from '../src/features/study-notes/model/controller.ts';
import { useStudyLibrary } from '../src/features/study-notes/model/library.ts';
import { deferred, mockDesktop, note, noteSummary } from './helpers.mjs';

const enoughText = Array.from({ length: 3 }, (_, line) =>
    Array.from({ length: 10 }, (_, word) => `concept${line}${word} explained with careful detail`).join(' ')).join('\n');
const feedback = correct => JSON.stringify({ correct, summary: 'Review', strengths: [], gaps: [], corrections: [] });
const storageKey = (vaultId, id) => `${vaultId}/${id}`;
const deck = (id, createdAt) => ({
    id, kind: 'written', title: `Material ${id}`, createdAt, sourceNoteId: 'source-a',
    items: [{ question: `Question ${id}`, answer: 'Reference', options: [], explanation: 'Evidence', sources: ['source-a'] }],
    progress: { items: [] },
});

const setup = (t, materials, { controller = true } = {}) => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map();
    const backend = new Map(materials.map(value => [storageKey('vault-a', value.id), value]));
    const writes = [], evaluations = [];
    let readCount = 0, study, library, setVault;
    const invoke = async (command, args) => {
        if (command === 'read_studies') {
            readCount++;
            const saved = [...backend].filter(([key]) => key.startsWith(`${args.vaultId}/`)).map(([, value]) => value);
            for (const value of saved) args.onItem.onmessage({ kind: 'item', item: studySummary(value) });
            args.onItem.onmessage({ kind: 'complete', total: saved.length });
            return;
        }
        if (command === 'read_study') return backend.get(storageKey(args.vaultId, args.studyId));
        if (command === 'save_study_progress') {
            const request = deferred();
            writes.push({ args, ...request });
            return request.promise.then(() => {
                const key = storageKey(args.vaultId, args.studyId), current = backend.get(key);
                if (!current) throw Error('STUDY_STORAGE_FAILED');
                backend.set(key, { ...current, progress: args.progress });
            });
        }
        throw Error(`Unexpected study command: ${command}`);
    };
    globalThis.window = { omegaDesktop: mockDesktop(invoke) };
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        key: index => [...values.keys()][index] ?? null,
        get length() { return values.size; },
    };
    const source = note('source-a', enoughText), summaries = [noteSummary(source)];
    const environment = {
        noteSummaries: () => summaries,
        currentNote: () => source,
        aiEnabled: () => true,
        normalAiMode: () => true,
        aiConnected: () => true,
        canGenerate: () => true,
        requestText: (_prompt, _signal, _context, purpose) => {
            if (purpose !== 'study-evaluation') return Promise.reject(Error('Unexpected study request'));
            const request = deferred(); evaluations.push(request); return request.promise;
        },
        describeAiError: failure => failure instanceof Error ? failure.message : String(failure),
        onOpenNote: () => {},
        t: key => key === 'locale' ? 'en' : key,
    };
    createRoot(dispose => {
        t.after(() => {
            dispose();
            if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
            else delete globalThis.window;
            if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
            else delete globalThis.localStorage;
        });
        const [vaultId, updateVault] = createSignal('vault-a');
        setVault = updateVault;
        const scopedEnvironment = { ...environment, vaultId };
        if (controller) study = useStudies(scopedEnvironment);
        else library = useStudyLibrary(scopedEnvironment);
    });
    return {
        study, library, backend, writes, evaluations,
        get readCount() { return readCount; },
        setVault,
    };
};

const waitFor = async condition => {
    for (let attempt = 0; attempt < 500; attempt++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw Error('Condition was not reached');
};

test('failure on one material stays visible after another succeeds and retry/flush cover every failed write', async t => {
    const f = setup(t, [deck('00000000-0000-4000-8000-000000000001', 1), deck('00000000-0000-4000-8000-000000000002', 2)]);
    f.study.show('written');
    await waitFor(() => f.readCount > 0 && !f.study.loading() && f.study.saved().length === 2);
    await f.study.studyRandom();
    await waitFor(() => f.study.stage() === 'running');

    f.study.review.submit('Answer A');
    f.study.review.submit('Answer B');
    await waitFor(() => f.evaluations.length === 1);
    f.evaluations[0].resolve(feedback(true));
    await waitFor(() => f.evaluations.length === 2 && f.writes.length === 1);
    f.evaluations[1].resolve(feedback(true));
    await waitFor(() => f.study.review.responses().length === 2 && f.study.review.responses().every(value => value.status === 'done') && f.study.savingProgress());

    const firstWrite = f.writes[0];
    firstWrite.reject(Error('first material failed'));
    await waitFor(() => f.writes.length === 2);
    const secondWrite = f.writes[1];
    assert.notEqual(firstWrite.args.studyId, secondWrite.args.studyId);
    secondWrite.resolve();
    await waitFor(() => !f.study.savingProgress() && f.study.progressFailed());
    assert.equal(f.study.error(), 'studyProgressFailed');
    assert.deepEqual(f.backend.get(storageKey('vault-a', secondWrite.args.studyId)).progress, secondWrite.args.progress);

    const retry = f.study.retryProgress();
    await waitFor(() => f.writes.length === 3);
    assert.equal(f.study.progressFailed(), true);
    assert.equal(f.study.savingProgress(), true);
    assert.equal(f.study.error(), 'studyProgressFailed');
    assert.equal(f.writes[2].args.studyId, firstWrite.args.studyId);
    assert.deepEqual(f.writes[2].args.progress, firstWrite.args.progress);
    f.writes[2].reject(Error('retry still failed'));
    assert.equal(await retry, false);
    assert.equal(f.study.progressFailed(), true);

    const shutdownFlush = f.study.flushSave();
    await waitFor(() => f.writes.length === 4);
    assert.equal(f.study.progressFailed(), true);
    assert.equal(f.study.savingProgress(), true);
    f.writes[3].reject(Error('flush still failed'));
    assert.equal(await shutdownFlush, false);
    assert.equal(f.study.progressFailed(), true);

    const recovered = f.study.retryProgress();
    await waitFor(() => f.writes.length === 5);
    f.writes[4].resolve();
    assert.equal(await recovered, true);
    assert.equal(f.study.progressFailed(), false);
    assert.deepEqual(f.backend.get(storageKey('vault-a', firstWrite.args.studyId)).progress, firstWrite.args.progress);
});

test('same-material writes and retries preserve the newest progress and remain scoped to their vault', async t => {
    const material = deck('00000000-0000-4000-8000-000000000003', 3);
    const f = setup(t, [material], { controller: false });
    await waitFor(() => f.readCount > 0 && !f.library.loading());
    const older = recordStudyOutcome(undefined, 0, 'wrong', 10);
    const latest = recordStudyOutcome(older, 0, 'correct', 20);
    const firstFailed = assert.rejects(f.library.saveProgress('vault-a', material.id, material.kind, older), /STUDY_STORAGE_FAILED/);
    const latestFailed = assert.rejects(f.library.saveProgress('vault-a', material.id, material.kind, latest), /STUDY_STORAGE_FAILED/);

    await waitFor(() => f.writes.length === 1);
    f.writes[0].reject(Error('older write failed'));
    await firstFailed;
    await waitFor(() => f.writes.length === 2);
    assert.deepEqual(f.writes[1].args.progress, latest);
    f.writes[1].reject(Error('latest write failed'));
    await latestFailed;
    assert.equal(f.library.progressFailed(), true);

    f.setVault('vault-b');
    await waitFor(() => f.readCount > 1 && !f.library.loading());
    assert.equal(f.library.progressFailed(), false);
    assert.equal(f.library.savingProgress(), false);
    assert.equal(await f.library.flushSave('vault-b'), true);
    assert.equal(f.writes.length, 2);

    const shutdownFlush = f.library.flushSave();
    await waitFor(() => f.writes.length === 3);
    assert.equal(f.writes[2].args.vaultId, 'vault-a');
    assert.deepEqual(f.writes[2].args.progress, latest);
    f.writes[2].resolve();
    assert.equal(await shutdownFlush, true);
    assert.equal(f.library.progressFailed(), false);
    assert.deepEqual(f.backend.get(storageKey('vault-a', material.id)).progress, latest);
});
