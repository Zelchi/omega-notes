import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import test from 'node:test';
import { useNoteLinkSuggestions } from '../src/features/suggest-note-link/model/suggestions.controller.ts';
import { settle } from './helpers.mjs';

const note = (id, title) => ({
	id,
	title,
	updatedAt: 0,
	links: [],
	hasContent: true,
	hasText: true,
	studyContentCharacters: 0,
	studyContentWords: 0,
	studyContentLines: 0,
});

const keyEvent = key => ({
	key,
	isComposing: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	preventDefault() {},
	stopPropagation() {},
});

test('keeps the selected note when the caret or matching suggestions update', async t => {
	let suggestions, setCaretOffset, setNotes, setText, selected;
	createRoot(dispose => {
		t.after(dispose);
		const [text, updateText] = createSignal('[[Al]]');
		const [caretOffset, updateCaretOffset] = createSignal(3);
		const [notes, updateNotes] = createSignal([note('alfa', 'Alfa'), note('alpine', 'Alpine')]);
		setText = updateText;
		setCaretOffset = updateCaretOffset;
		setNotes = updateNotes;
		suggestions = useNoteLinkSuggestions({
			notes,
			text,
			caretOffset,
			onSelect: value => { selected = value; },
		});
	});

	await settle();
	assert.equal(suggestions.handleKeyDown(keyEvent('ArrowDown')), true);
	const selectedId = suggestions.suggestions()[suggestions.selectedIndex()].id;
	assert.equal(selectedId, 'alpine');

	setCaretOffset(undefined);
	await settle();
	setCaretOffset(4);
	await settle();
	assert.equal(suggestions.suggestions()[suggestions.selectedIndex()].id, selectedId);

	setNotes(current => [...current, note('albatross', 'Albatross')]);
	await settle();
	assert.equal(suggestions.suggestions()[suggestions.selectedIndex()].id, selectedId);

	assert.equal(suggestions.handleKeyDown(keyEvent('Enter')), true);
	assert.equal(selected.id, selectedId);

	setNotes(current => [...current, note('beta', 'Beta'), note('beyond', 'Beyond')]);
	await settle();
	setText('[[Be]]');
	setCaretOffset(3);
	await settle();
	assert.equal(suggestions.selectedIndex(), 0);
	assert.equal(suggestions.suggestions()[0].id, 'beta');
});
