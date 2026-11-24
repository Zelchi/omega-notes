import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSignal } from 'solid-js';
import { useTemporaryNoteReading } from '../src/features/temporary-note-reading/model/temporary-reading.controller.ts';

const mount = t => {
	const previous = new Map(['window', 'document', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection']
		.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
	const listeners = new Map();
	const addListener = (target, type, handler) => {
		const handlers = listeners.get(target) ?? new Map();
		handlers.set(type, handler);
		listeners.set(target, handlers);
	};
	globalThis.window = {
		addEventListener: (type, handler) => addListener('window', type, handler),
		removeEventListener: () => undefined,
	};
	globalThis.document = {
		hidden: false,
		activeElement: null,
		querySelector: () => null,
		addEventListener: (type, handler) => addListener('document', type, handler),
		removeEventListener: () => undefined,
	};
	globalThis.HTMLElement = class HTMLElement {};
	globalThis.requestAnimationFrame = () => 1;
	globalThis.cancelAnimationFrame = () => undefined;
	globalThis.getSelection = () => null;

	let dispose;
	let state;
	createRoot(stop => {
		dispose = stop;
		const [mode] = createSignal('edit');
		const [enabled] = createSignal(true);
		const [noteId] = createSignal('note-a');
		state = useTemporaryNoteReading({ mode, enabled, noteId });
	});
	t.after(() => {
		dispose();
		for (const [key, descriptor] of previous) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globalThis[key];
		}
	});
	return {
		mode: state.mode,
		dispatch: (target, type, event) => listeners.get(target)?.get(type)?.({
			preventDefault: () => { event.defaultPrevented = true; },
			getModifierState: modifier => modifier === 'AltGraph' && Boolean(event.altGraph),
			...event,
		}),
	};
};

test('holding left Alt temporarily switches edit mode to reading and keyup restores edit mode', t => {
	const f = mount(t);
	const down = { code: 'AltLeft', key: 'Alt', altKey: true, defaultPrevented: false };
	f.dispatch('window', 'keydown', down);
	assert.equal(down.defaultPrevented, true);
	assert.equal(f.mode(), 'view');

	const up = { code: 'AltLeft', key: 'Alt', altKey: false, defaultPrevented: false };
	f.dispatch('window', 'keyup', up);
	assert.equal(up.defaultPrevented, true);
	assert.equal(f.mode(), 'edit');
});

test('right Alt and modified left Alt do not enter temporary reading mode', t => {
	const f = mount(t);
	f.dispatch('window', 'keydown', { code: 'AltRight', key: 'Alt', altKey: true });
	assert.equal(f.mode(), 'edit');

	f.dispatch('window', 'keydown', { code: 'AltLeft', key: 'Alt', altKey: true, ctrlKey: true });
	assert.equal(f.mode(), 'edit');
});

test('using another key while left Alt is held immediately exits temporary reading mode', t => {
	const f = mount(t);
	f.dispatch('window', 'keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
	assert.equal(f.mode(), 'view');

	f.dispatch('window', 'keydown', { code: 'KeyA', key: 'a', altKey: true });
	assert.equal(f.mode(), 'edit');
});
