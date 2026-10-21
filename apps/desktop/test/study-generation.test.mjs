import test from 'node:test';
import assert from 'node:assert/strict';
import { note } from './helpers.mjs';
import { summarizeNote } from '../src/entities/note/model/note-summary.ts';
import { createStudyPlan, createStudySourceResolver } from '../src/features/study-notes/model/context.ts';
import { generateStudyMaterial } from '../src/features/study-notes/model/generation.ts';
import { decodeGeneratedItem, createSourceReferences, parseGeneratedFeedback } from '../src/features/study-notes/model/ai-response.ts';
import { createEvaluationContextCache } from '../src/features/study-notes/model/evaluation-context.ts';
import { studyPrompt } from '../src/features/study-notes/model/study-prompt.ts';

const enoughText = Array.from({ length: 3 }, (_, line) =>
    Array.from({ length: 10 }, (_, word) => `concept${line}${word} explained with careful detail`).join(' ')).join('\n');
const withStudyStats = (value, links = []) => ({ ...summarizeNote(value), links });
const notes = [withStudyStats(note('a', `${enoughText}\n[[b]]`), ['b']), withStudyStats(note('b', enoughText)), withStudyStats(note('empty', '  '))];
const run = async (count, reply, overrides = {}) => {
    const plan = createStudyPlan(notes, count), calls = [], kind = overrides.kind ?? 'written';
    const options = { notes: () => notes, t: () => 'en', requestText: async (prompt, signal, context, purpose) => {
        calls.push({ prompt, context, purpose });
        return JSON.stringify(await reply(context.items, calls.length));
    } };
    const material = await generateStudyMaterial(options, { plan, kind,
        signal: overrides.signal ?? new AbortController().signal, active: overrides.active ?? (() => true) });
    return { material, calls, plan };
};
const valid = items => ({ title: 'Study', items: items.map(item => ({ itemId: item.itemId,
    question: 'Question ' + item.itemId, answer: 'Answer', sources: ['N1'] })) });

for (const count of [5, 10, 20, 30]) test(`generation requests each item separately and preserves order: ${count}`, async () => {
    const result = await run(count, items => ({ ...valid(items), items: valid(items).items.reverse() }));
    assert.equal(result.calls.length, count);
    assert.equal(result.material.length, count);
    assert.deepEqual(result.material.map(material => material.item.question), result.plan.map(item => 'Question ' + item.itemId));
    assert.ok(result.calls.every(call => call.purpose === 'study-generation' && call.context.items.length === 1));
});
test('a missing generated item is retried without changing its assignment', async () => {
    const result = await run(1, (items, attempt) => attempt === 1
        ? { title: 'Study', items: [{ ...valid(items).items[0], itemId: 'another-item' }] }
        : valid(items));
    assert.deepEqual(result.calls.map(call => call.context.items.length), [1, 1]);
    assert.equal(result.material.length, 1);
});
test('duplicate item IDs are rejected and retried', async () => {
    const result = await run(1, (items, attempt) => {
        const data = valid(items); if (attempt === 1) data.items.push(data.items[0]); return data;
    });
    assert.deepEqual(result.calls.map(call => call.context.items.length), [1, 1]);
});
test('a missing response is retried at most three times', async () => {
    let calls = 0;
    await assert.rejects(run(1, items => { calls++; return { ...valid(items), items: [{ ...valid(items).items[0], itemId: 'missing' }] }; }), /STUDY_ITEM_COUNT_MISMATCH/);
    assert.equal(calls, 3);
});
test('insufficient source checks retry a different candidate before any successful AI response', async () => {
    const values = [withStudyStats(note('first', enoughText)), withStudyStats(note('second', enoughText))];
    const plan = createStudyPlan(values, 1, new Set(['second'])), candidates = [], sentToAi = [];
    const material = await generateStudyMaterial({ noteSummaries: () => values, t: () => 'en', requestText: async (_prompt, _signal, context) => {
        const assignment = context.items[0]; candidates.push(assignment.candidateId);
        if (candidates.length === 1) throw Error('STUDY_INSUFFICIENT_CONTENT');
        sentToAi.push(assignment.candidateId);
        return JSON.stringify(valid(context.items));
    } }, { plan, kind: 'written', signal: new AbortController().signal, active: () => true });
    assert.deepEqual(candidates, ['first', 'second']);
    assert.deepEqual(sentToAi, ['second']);
    assert.equal(material[0].assignment.candidateId, 'second');
});
test('cancelled generation does not send a request', async () => {
    const token = new AbortController(); token.abort(); let calls = 0;
    await assert.rejects(run(1, items => { calls++; return valid(items); }, { signal: token.signal }), /AI_CANCELLED/);
    assert.equal(calls, 0);
});
test('note summaries expose the content counts used to filter study sources', () => {
    const summary = summarizeNote(note('measured', enoughText));
    assert.equal(summary.studyContentCharacters, [...enoughText].length);
    assert.equal(summary.studyContentWords, enoughText.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length);
    assert.equal(summary.studyContentLines, enoughText.split(/\r?\n/u).filter(line => line.trim()).reduce((count, line) => count + Math.ceil([...line].length / 80), 0));
});
test('study plans filter insufficient notes before drawing and allow sufficient references', () => {
    const tooFewWords = Array.from({ length: 3 }, (_, line) =>
        Array.from({ length: 8 }, (_, word) => `explanation${line}${word}overlongtokenword`).join(' ')).join('\n');
    const values = [withStudyStats(note('empty', ''), ['support']), withStudyStats(note('short', 'Tiny note')),
        withStudyStats(note('too-few-characters', 'x '.repeat(25))), withStudyStats(note('too-few-words', tooFewWords)),
        withStudyStats(note('support', enoughText))];
    const plan = createStudyPlan(values, 10);
    assert.deepEqual(new Set(plan.map(item => item.candidateId)), new Set(['empty', 'support']));
    assert.ok(plan.every(item => item.noteId === 'support'));
    assert.deepEqual(createStudyPlan(values.slice(1, 4), 1), []);
});
test('an empty selected note uses the first linked note with text as primary source', () => {
    const values = [
        withStudyStats(note('empty', ''), ['blank']),
        withStudyStats(note('blank', ''), ['content']),
        withStudyStats(note('content', enoughText)),
    ];
    const plan = createStudyPlan(values, 1, new Set(['blank', 'content']));
    assert.equal(plan[0].noteId, 'content');
    assert.equal(plan[0].candidateId, 'empty');
    assert.equal(plan[0].sourceIds.has('empty'), false);
});
test('source resolution follows empty references up to three levels and ignores deeper links', () => {
    const values = [
        { ...note('a', ''), links: ['b'] },
        { ...note('b', ''), links: ['c'] },
        { ...note('c', 'C content'), links: ['d'] },
        { ...note('d', 'D content'), links: ['e'] },
        { ...note('e', 'E content'), links: [] },
    ];
    assert.deepEqual(createStudySourceResolver(values)(values[0]).map(value => value.id), ['a', 'c', 'd']);
});
test('source resolution follows references through three levels from a nonempty note', () => {
    const values = [
        { ...note('a', 'A content'), links: ['b'] },
        { ...note('b', 'B content'), links: ['c'] },
        { ...note('c', 'C content'), links: ['d'] },
        { ...note('d', 'D content'), links: ['e'] },
        { ...note('e', 'E content'), links: [] },
    ];
    assert.deepEqual(createStudySourceResolver(values)(values[0]).map(value => value.id), ['a', 'b', 'c', 'd']);
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
    const prompt = studyPrompt(kind, 'en', createStudyPlan(notes, 1));
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
    assert.equal(result.material.length, 5);
    assert.ok(result.material.every(material => material.item.sources[0] === material.assignment.noteId &&
        material.item.question && (material.item.answer || material.item.options.length)));
});
