import { DEFAULT_NOTE_LOCK_SHORTCUT, isKeyboardShortcut, type KeyboardShortcut } from "./ai-chat-shortcut";
export { DEFAULT_NOTE_LOCK_SHORTCUT };

export type NoteLockShortcut = KeyboardShortcut;
export const isNoteLockShortcut = isKeyboardShortcut;
