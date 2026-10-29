import { isKeyboardShortcut, type KeyboardShortcut } from "./ai-chat-shortcut";

export type NoteLockShortcut = KeyboardShortcut;
export const DEFAULT_NOTE_LOCK_SHORTCUT: NoteLockShortcut = { code: "KeyL", ctrl: true, alt: false, shift: true };
export const isNoteLockShortcut = isKeyboardShortcut;
