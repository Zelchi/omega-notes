import assert from 'node:assert/strict';
import test from 'node:test';
import {
	readBackgroundIntensity, saveBackgroundIntensity, readCanvasLayout, saveCanvasLayout,
	readKanbanShortcut, saveKanbanShortcut, readNoteLockShortcut, saveNoteLockShortcut,
	readPomodoroShortcut, savePomodoroShortcut,
} from '../src/features/change-preferences/api/preferences.repository.ts';
import { usePreferences } from '../src/features/change-preferences/model/preferences.controller.ts';
import { DEFAULT_NOTE_LOCK_SHORTCUT } from '../src/features/change-preferences/model/note-lock-shortcut.ts';
import { DEFAULT_KANBAN_SHORTCUT, DEFAULT_POMODORO_SHORTCUT, hasKeyboardShortcutConflict, matchesKeyboardShortcut } from '../src/features/change-preferences/model/ai-chat-shortcut.ts';

const storage = t => {
	const previousStorage = globalThis.localStorage;
	const data = new Map();
	globalThis.localStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => data.set(key, String(value)),
	};
	t.after(() => {
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	});
	return data;
};

test('supported canvas layouts are persisted', t => {
	const data = storage(t);
	saveCanvasLayout('static');
	assert.equal(data.get('omega-notes.canvas-layout'), 'static');
	saveCanvasLayout('dynamic');
	assert.equal(data.get('omega-notes.canvas-layout'), 'dynamic');
});

test('unsupported legacy canvas layout falls back to dynamic', t => {
	const data = storage(t);
	data.set('omega-notes.canvas-layout', 'archive');
	assert.equal(readCanvasLayout(), 'dynamic');
});

test('note lock shortcut defaults, persists, and rejects invalid saved values', t => {
	const data = storage(t);
	assert.deepEqual(readNoteLockShortcut(), DEFAULT_NOTE_LOCK_SHORTCUT);

	const customShortcut = { code: 'KeyK', ctrl: false, alt: true, shift: true };
	saveNoteLockShortcut(customShortcut);
	assert.equal(data.get('omega-notes.settings.note-lock-shortcut'), JSON.stringify(customShortcut));
	assert.deepEqual(readNoteLockShortcut(), customShortcut);

	data.set('omega-notes.settings.note-lock-shortcut', JSON.stringify({ ...customShortcut, code: 'NotAKey' }));
	assert.deepEqual(readNoteLockShortcut(), DEFAULT_NOTE_LOCK_SHORTCUT);
	data.set('omega-notes.settings.note-lock-shortcut', '{broken json');
	assert.deepEqual(readNoteLockShortcut(), DEFAULT_NOTE_LOCK_SHORTCUT);
});

test('Pomodoro and Kanban shortcuts have defaults, persist, and reject invalid values', t => {
	const data = storage(t);
	assert.deepEqual(readPomodoroShortcut(), DEFAULT_POMODORO_SHORTCUT);
	assert.deepEqual(readKanbanShortcut(), DEFAULT_KANBAN_SHORTCUT);

	const pomodoroShortcut = { code: 'KeyO', ctrl: true, alt: true, shift: false };
	const kanbanShortcut = { code: 'KeyN', ctrl: false, alt: true, shift: true };
	savePomodoroShortcut(pomodoroShortcut);
	saveKanbanShortcut(kanbanShortcut);
	assert.equal(data.get('omega-notes.settings.pomodoro-shortcut'), JSON.stringify(pomodoroShortcut));
	assert.equal(data.get('omega-notes.settings.kanban-shortcut'), JSON.stringify(kanbanShortcut));
	assert.deepEqual(readPomodoroShortcut(), pomodoroShortcut);
	assert.deepEqual(readKanbanShortcut(), kanbanShortcut);

	data.set('omega-notes.settings.pomodoro-shortcut', JSON.stringify({ ...pomodoroShortcut, code: 'NotAKey' }));
	data.set('omega-notes.settings.kanban-shortcut', '{broken json');
	assert.deepEqual(readPomodoroShortcut(), DEFAULT_POMODORO_SHORTCUT);
	assert.deepEqual(readKanbanShortcut(), DEFAULT_KANBAN_SHORTCUT);
});

test('panel shortcuts match only the configured key and modifiers', () => {
	const event = overrides => ({
		code: 'KeyP', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false,
		getModifierState: () => false, target: null, ...overrides,
	});
	assert.equal(matchesKeyboardShortcut(event({}), DEFAULT_POMODORO_SHORTCUT), true);
	assert.equal(matchesKeyboardShortcut(event({ shiftKey: false }), DEFAULT_POMODORO_SHORTCUT), false);
	assert.equal(matchesKeyboardShortcut(event({ metaKey: true }), DEFAULT_POMODORO_SHORTCUT), false);
	assert.equal(matchesKeyboardShortcut({ ...event({}), getModifierState: key => key === 'AltGraph' }, DEFAULT_POMODORO_SHORTCUT), false);
});

test('shortcut collisions compare key and every modifier exactly', () => {
	assert.equal(hasKeyboardShortcutConflict(DEFAULT_POMODORO_SHORTCUT, [DEFAULT_KANBAN_SHORTCUT]), false);
	assert.equal(hasKeyboardShortcutConflict(DEFAULT_POMODORO_SHORTCUT, [{ ...DEFAULT_POMODORO_SHORTCUT }]), true);
	assert.equal(hasKeyboardShortcutConflict(DEFAULT_POMODORO_SHORTCUT, [{ ...DEFAULT_POMODORO_SHORTCUT, shift: false }]), false);
});

test('shortcut settings reject collisions against every other configured action', t => {
	storage(t);
	const previousDocument = globalThis.document;
	globalThis.document = { documentElement: { dataset: {}, style: { colorScheme: '' } } };
	t.after(() => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	});
	const preferences = usePreferences();
	const initialKanban = preferences.kanbanShortcut();
	assert.equal(preferences.setPomodoroShortcut(initialKanban), false);
	assert.deepEqual(preferences.pomodoroShortcut(), DEFAULT_POMODORO_SHORTCUT);
	assert.equal(preferences.setKanbanShortcut(preferences.searchShortcut()), false);
	assert.deepEqual(preferences.kanbanShortcut(), initialKanban);
	assert.equal(preferences.setSearchShortcut(preferences.aiChatShortcut()), false);
	assert.equal(preferences.setCanvasLayoutShortcut(preferences.noteLockShortcut()), false);
	assert.equal(preferences.setAiChatShortcut(preferences.canvasLayoutShortcut()), false);
	assert.equal(preferences.setNoteLockShortcut(preferences.pomodoroShortcut()), false);
	assert.equal(preferences.setKanbanShortcut({ code: 'KeyQ', ctrl: true, alt: true, shift: false }), true);
});

test('legacy shortcut collisions are reset to distinct defaults on startup', t => {
	const data = storage(t);
	const previousDocument = globalThis.document;
	globalThis.document = { documentElement: { dataset: {}, style: { colorScheme: '' } } };
	t.after(() => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	});
	data.set('omega-notes.settings.pomodoro-shortcut', JSON.stringify(DEFAULT_KANBAN_SHORTCUT));
	data.set('omega-notes.settings.kanban-shortcut', JSON.stringify(DEFAULT_KANBAN_SHORTCUT));

	const preferences = usePreferences();

	assert.deepEqual(preferences.pomodoroShortcut(), DEFAULT_POMODORO_SHORTCUT);
	assert.deepEqual(preferences.kanbanShortcut(), DEFAULT_KANBAN_SHORTCUT);
	assert.notDeepEqual(JSON.parse(data.get('omega-notes.settings.pomodoro-shortcut')), JSON.parse(data.get('omega-notes.settings.kanban-shortcut')));
});

test('background intensity defaults, persists, and clamps saved values', t => {
	const data = storage(t);
	assert.equal(readBackgroundIntensity(), 0.6);
	saveBackgroundIntensity(0.8);
	assert.equal(readBackgroundIntensity(), 0.8);
	data.set('omega-notes.settings.background-intensity', '2');
	assert.equal(readBackgroundIntensity(), 1);
	data.set('omega-notes.settings.background-intensity', '-1');
	assert.equal(readBackgroundIntensity(), 0);
	data.set('omega-notes.settings.background-intensity', 'invalid');
	assert.equal(readBackgroundIntensity(), 0.6);
});

test('changing background intensity updates and persists immediately', t => {
	storage(t);
	const previousDocument = globalThis.document;
	globalThis.document = {
		documentElement: {
			dataset: {},
			style: { colorScheme: '' },
		},
	};
	t.after(() => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	});

	const preferences = usePreferences();
	preferences.setBackgroundIntensity(0.2);
	assert.equal(preferences.backgroundIntensity(), 0.2);
	assert.equal(readBackgroundIntensity(), 0.2);
});
