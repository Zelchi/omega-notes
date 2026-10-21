import { formatKeyboardShortcut, isKeyboardShortcut, type KeyboardShortcut } from "./ai-chat-shortcut";

export type CanvasLayoutShortcut = KeyboardShortcut;
export const DEFAULT_CANVAS_LAYOUT_SHORTCUT: CanvasLayoutShortcut = { code: "KeyV", ctrl: true, alt: false, shift: true };
export const isCanvasLayoutShortcut = isKeyboardShortcut;
export const formatCanvasLayoutShortcut = formatKeyboardShortcut;

export const matchesCanvasLayoutShortcut = (event: KeyboardEvent, shortcut: CanvasLayoutShortcut): boolean => {
	if (event.defaultPrevented || event.isComposing || event.metaKey || event.getModifierState("AltGraph")
		|| event.code !== shortcut.code || event.ctrlKey !== shortcut.ctrl
		|| event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) return false;
	const target = event.target;
	if (target instanceof Element && (target.closest("input, textarea, [role='textbox']")
		|| (target.closest("[contenteditable]") as HTMLElement | null)?.isContentEditable)) return false;
	return true;
};
