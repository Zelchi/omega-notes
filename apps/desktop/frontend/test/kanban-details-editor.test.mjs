import assert from 'node:assert/strict';
import test from 'node:test';
import { createKanbanDetailsDraft } from '../src/features/manage-kanban/model/details-editor.ts';

const item = overrides => ({
	id: 'card-1',
	title: 'Prepare release',
	description: 'legacy description',
	noteId: 'note-1',
	status: 'inProgress',
	position: 2,
	priority: 'none',
	labels: ['desktop', 'release'],
	dueDate: '2026-11-30',
	createdAt: 1,
	updatedAt: 2,
	...overrides,
});

test('Kanban details draft resolves linked note title and prepares editable card fields', () => {
	let resolvedNoteId;
	const draft = createKanbanDetailsDraft(item(), noteId => {
		resolvedNoteId = noteId;
		return 'Release checklist';
	});

	assert.equal(resolvedNoteId, 'note-1');
	assert.deepEqual(draft, {
		id: 'card-1',
		title: 'Prepare release',
		noteId: 'note-1',
		noteQuery: 'Release checklist',
		notePickerOpen: false,
		noteLinkError: false,
		priority: 'low',
		labels: 'desktop, release',
		dueDate: '2026-11-30',
	});
});

test('Kanban details draft preserves a missing linked-note reference and clears optional fields', () => {
	const draft = createKanbanDetailsDraft(item({
		noteId: 'missing-note',
		priority: 'high',
		labels: [],
		dueDate: null,
	}), noteId => noteId === 'missing-note' ? 'Archived note' : '');

	assert.equal(draft.noteQuery, 'Archived note');
	assert.equal(draft.priority, 'high');
	assert.equal(draft.labels, '');
	assert.equal(draft.dueDate, '');

	let resolved = false;
	const unlinked = createKanbanDetailsDraft(item({ noteId: null }), () => {
		resolved = true;
		return 'unused';
	});
	assert.equal(unlinked.noteQuery, '');
	assert.equal(resolved, false);
});
