import test from 'node:test';
import assert from 'node:assert/strict';
import { note } from './helpers.mjs';
import { createStudyPlan, createStudySourceResolver } from '../src/features/study-notes/model/context.ts';
import { generateStudyMaterial } from '../src/features/study-notes/model/generation.ts';
import { decodeGeneratedItem, createSourceReferences, parseGeneratedFeedback } from '../src/features/study-notes/model/ai-response.ts';
import { createEvaluationContextCache } from '../src/features/study-notes/model/evaluation-context.ts';
import { studyPrompt } from '../src/features/study-notes/model/study-prompt.ts';

const notes = [note('a', 'A subject [[b]]'), note('b', 'Another subject'), note('empty', '  ')];
const run = async (count, reply, overrides = {}) => {
    const plan = createStudyPlan(notes, notes[0], count), calls = [];
    const options = { notes: () => notes, t: () => 'en', requestText: async (prompt, signal, context, purpose) => {
        calls.push({ prompt, context, purpose });
        return JSON.stringify(await reply(context.items, calls.length));
    } };
    const material = await generateStudyMaterial(options, { plan, kind: 'written', focused: true,
        signal: new AbortController().signal, active: () => true, ...overrides });
    return { material, calls, plan };
};
const valid = items => ({ title: 'Study', items: items.map(item => ({ itemId: item.itemId,
    question: 'Question ' + item.itemId, answer: 'Answer', sources: ['N1'] })) });

for (const count of [5, 10, 20, 30]) test(`generation uses batches of five and preserves order: ${count}`, async () => {
    const result = await run(count, items => ({ ...valid(items), items: valid(items).items.reverse() }));
    assert.equal(result.calls.length, count / 5);
    assert.equal(result.material.items.length, count);
    assert.deepEqual(result.material.items.map(item => item.question), result.plan.map(item => 'Question ' + item.itemId));
    assert.ok(result.calls.every(call => call.purpose === 'study-generation' && call.context.items.length <= 5));
});
test('a missing item is retried alone without regenerating accepted questions', async () => {
    const result = await run(5, (items, attempt) => valid(attempt === 1 ? items.slice(1) : items));
    assert.deepEqual(result.calls.map(call => call.context.items.length), [5, 1]);
    assert.equal(result.material.items.length, 5);
});
test('duplicate item IDs are retried instead of being counted twice', async () => {
    const result = await run(5, (items, attempt) => {
        const data = valid(items); if (attempt === 1) data.items.push(data.items[0]); return data;
    });
    assert.deepEqual(result.calls.map(call => call.context.items.length), [5, 1]);
});
test('invalid material stops after three rounds and cannot return an incomplete session', async () => {
    let calls = 0;
    await assert.rejects(run(5, () => { calls++; return { title: 'Study', items: [] }; }), /STUDY_ITEM_COUNT_MISMATCH/);
    assert.equal(calls, 3);
});
test('cancelled generation does not send a request', async () => {
    const token = new AbortController(); token.abort(); let calls = 0;
    await assert.rejects(run(5, items => { calls++; return valid(items); }, { signal: token.signal }), /AI_CANCELLED/);
    assert.equal(calls, 0);
});
test('general plans skip empty notes and draw distinct subjects before repeating', () => {
    const plan = createStudyPlan(notes, undefined, 6);
    assert.ok(plan.every(item => item.noteId !== 'empty'));
    assert.notEqual(plan[0].noteId, plan[1].noteId);
});
test('source resolution includes direct references without expanding recursively or reading code links', () => {
    const values = [note('a', '[[b]] `[[c]]`'), note('b', '[[c]]'), note('c', 'content')];
    assert.deepEqual(createStudySourceResolver(values)(values[0]).map(value => value.id), ['a', 'b']);
});
test('evaluation cache reuses a source scope and invalidates renamed or changed notes', () => {
    const cache = createEvaluationContextCache(), item = { sources: ['a'] };
    const original = cache.get(notes, item);
    assert.equal(cache.get(notes, item), original);
    assert.equal(cache.unchanged(original, [...notes], item), true);
    assert.equal(cache.unchanged(original, [{ ...notes[0], title: 'Renamed' }, ...notes.slice(1)], item), false);
    assert.equal(cache.unchanged(original, [note('a', 'Changed'), ...notes.slice(1)], item), false);
    cache.clear(); assert.notEqual(cache.get(notes, item), original);
});
test('evaluation cache detects changes in resolved references and missing sources', () => {
    const cache = createEvaluationContextCache(), item = { sources: ['a'] }, before = cache.get(notes, item);
    assert.equal(cache.unchanged(before, [...notes, note('c', 'extra')], item), true);
    const changed = [note('a', 'A subject [[c]]'), ...notes.slice(1), note('c', 'extra')];
    assert.equal(cache.unchanged(before, changed, item), false);
    assert.throws(() => cache.get(notes.slice(1), item), /STUDY_SOURCE_MISSING/);
});
test('quiz conversion shuffles while preserving the correct answer', () => {
    const item = decodeGeneratedItem({ question: 'Which?', answer: 'Right', distractors: ['Wrong1', 'Wrong2', 'Wrong3'],
        explanation: 'Because', sources: ['N1'] }, 'quiz', createSourceReferences(['a']), new Set(['a']));
    assert.equal(item.options[item.correctIndex], 'Right'); assert.deepEqual(item.sources, ['a']);
});
test('cloze conversion constructs markers and rejects unauthorized source aliases', () => {
    const raw = { parts: ['The answer is ', { answers: ['IA', 'Artificial Intelligence'] }, '.'], explanation: 'Meaning', sources: ['N1'] };
    const references = createSourceReferences(['a']);
    assert.equal(decodeGeneratedItem(raw, 'cloze', references, new Set(['a'])).question, 'The answer is {{1}}.');
    assert.throws(() => decodeGeneratedItem({ ...raw, sources: ['N2'] }, 'cloze', references, new Set(['a'])), /STUDY_INVALID_RESPONSE/);
});
test('cloze grading derives overall accuracy from per-blank results', () => {
    const data = { blankResults: [true, false], correct: true, summary: 'Partial', strengths: [], gaps: [], corrections: [] };
    assert.equal(parseGeneratedFeedback(JSON.stringify(data), createSourceReferences(['a']), 2).correct, false);
    assert.throws(() => parseGeneratedFeedback(JSON.stringify(data), createSourceReferences(['a']), 1), /STUDY_INVALID_RESPONSE/);
});
for (const kind of ['flashcards', 'written', 'cloze', 'correction']) test(`non-quiz prompts omit quiz format rules: ${kind}`, () => {
    const prompt = studyPrompt(kind, 'en', createStudyPlan(notes, notes[0], 5));
    assert.ok(prompt.includes('read_study_context'));
    assert.equal(prompt.includes('exactly three plausible but incorrect distractors'), false);
});
for (const kind of ['flashcards', 'quiz', 'cloze', 'correction']) test(`generation normalizes valid material for ${kind}`, async () => {
    const result = await run(5, items => ({ title: 'Study', items: items.map(item => {
        const base = { itemId: item.itemId, sources: ['N1'], explanation: 'Evidence' };
        if (kind === 'cloze') return { ...base, parts: ['Subject ' + item.itemId + ' means ', { answers: ['concept'] }, '.'] };
        if (kind === 'correction') return { ...base, segments: [
            { text: 'Subject ' + item.itemId + '. ', incorrect: false },
            { text: 'It is wrong. ', incorrect: true, correction: 'It is right. ' },
            { text: 'Another valid fact.', incorrect: false },
        ] };
        return { ...base, question: 'Question ' + item.itemId, answer: 'Right',
            ...(kind === 'quiz' ? { distractors: ['Wrong1', 'Wrong2', 'Wrong3'] } : {}) };
    }) }), { kind });
    assert.equal(result.material.items.length, 5);
    assert.ok(result.material.items.every(item => item.sources[0] === 'a' && item.question && (item.answer || item.options.length)));
});
