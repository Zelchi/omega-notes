import { formatKeyboardShortcut, isKeyboardShortcut, type KeyboardShortcut } from "./ai-chat-shortcut";

export type SearchShortcut = KeyboardShortcut;

export const DEFAULT_SEARCH_SHORTCUT: SearchShortcut = { code: "KeyP", ctrl: true, alt: false, shift: false };
export const isSearchShortcut = isKeyboardShortcut;
export const formatSearchShortcut = formatKeyboardShortcut;

export const matchesSearchShortcut = (event: KeyboardEvent, shortcut: SearchShortcut): boolean => {
	if (event.defaultPrevented || event.isComposing || event.metaKey || event.getModifierState("AltGraph")
		|| event.code !== shortcut.code || event.ctrlKey !== shortcut.ctrl
		|| event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) return false;
	if (!shortcut.ctrl && !shortcut.alt && !/^F\d+$/.test(shortcut.code)) {
		const target = event.target;
		if (target instanceof Element && (target.closest("input, textarea, [role='textbox']")
			|| (target.closest("[contenteditable]") as HTMLElement | null)?.isContentEditable)) return false;
	}
	return true;
};
