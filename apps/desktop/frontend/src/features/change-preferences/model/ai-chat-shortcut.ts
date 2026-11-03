export type KeyboardShortcut = { code: string; ctrl: boolean; alt: boolean; shift: boolean };
export type AiChatShortcut = KeyboardShortcut;

export type ConfiguredShortcutName = "aiChat" | "pomodoro" | "kanban" | "search" | "canvasLayout" | "noteLock";
export type ConfiguredShortcuts = Record<ConfiguredShortcutName, KeyboardShortcut>;

export const DEFAULT_AI_CHAT_SHORTCUT: AiChatShortcut = { code: "KeyJ", ctrl: true, alt: false, shift: false };
export const DEFAULT_POMODORO_SHORTCUT: KeyboardShortcut = { code: "KeyP", ctrl: true, alt: false, shift: true };
export const DEFAULT_KANBAN_SHORTCUT: KeyboardShortcut = { code: "KeyB", ctrl: true, alt: false, shift: true };
export const DEFAULT_SEARCH_SHORTCUT: KeyboardShortcut = { code: "KeyP", ctrl: true, alt: false, shift: false };
export const DEFAULT_CANVAS_LAYOUT_SHORTCUT: KeyboardShortcut = { code: "KeyV", ctrl: true, alt: false, shift: true };
export const DEFAULT_NOTE_LOCK_SHORTCUT: KeyboardShortcut = { code: "KeyL", ctrl: true, alt: false, shift: true };
export const DEFAULT_CONFIGURED_SHORTCUTS: ConfiguredShortcuts = {
    aiChat: DEFAULT_AI_CHAT_SHORTCUT,
    pomodoro: DEFAULT_POMODORO_SHORTCUT,
    kanban: DEFAULT_KANBAN_SHORTCUT,
    search: DEFAULT_SEARCH_SHORTCUT,
    canvasLayout: DEFAULT_CANVAS_LAYOUT_SHORTCUT,
    noteLock: DEFAULT_NOTE_LOCK_SHORTCUT,
};

const keyCodes = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|IntlBackslash|IntlRo|IntlYen|Semicolon|Quote|Comma|Period|Slash)$/;
const keyLabels: Record<string, string> = {
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};

export const isKeyboardShortcut = (value: unknown): value is KeyboardShortcut => {
    if (!value || typeof value !== "object") return false;
	const shortcut = value as KeyboardShortcut;
    return typeof shortcut.code === "string" && keyCodes.test(shortcut.code)
        && typeof shortcut.ctrl === "boolean" && typeof shortcut.alt === "boolean" && typeof shortcut.shift === "boolean"
        && !(shortcut.code === "KeyA" && shortcut.ctrl && !shortcut.alt && !shortcut.shift);
};

export const isAiChatShortcut = isKeyboardShortcut;

export const hasKeyboardShortcutConflict = (shortcut: KeyboardShortcut, others: readonly KeyboardShortcut[]): boolean =>
    others.some(other => other.code === shortcut.code && other.ctrl === shortcut.ctrl
        && other.alt === shortcut.alt && other.shift === shortcut.shift);

const sameKeyboardShortcut = (left: KeyboardShortcut, right: KeyboardShortcut): boolean =>
    left.code === right.code && left.ctrl === right.ctrl && left.alt === right.alt && left.shift === right.shift;

export const resolveShortcutConflicts = (shortcuts: ConfiguredShortcuts): ConfiguredShortcuts => {
    const resolved = Object.fromEntries(Object.entries(shortcuts).map(([name, shortcut]) => [name, { ...shortcut }])) as ConfiguredShortcuts;
    const names = Object.keys(resolved) as ConfiguredShortcutName[];
    for (let attempt = 0; attempt < names.length; attempt += 1) {
        const conflicted = new Set<keyof ConfiguredShortcuts>();
        for (let index = 0; index < names.length; index += 1) {
            for (let other = index + 1; other < names.length; other += 1) {
                if (sameKeyboardShortcut(resolved[names[index]], resolved[names[other]])) {
                    conflicted.add(names[index]);
                    conflicted.add(names[other]);
                }
            }
        }
        if (conflicted.size === 0) return resolved;
        for (const name of conflicted) resolved[name] = { ...DEFAULT_CONFIGURED_SHORTCUTS[name] };
    }
    return Object.fromEntries(names.map(name => [name, { ...DEFAULT_CONFIGURED_SHORTCUTS[name] }])) as ConfiguredShortcuts;
};

export const formatKeyboardShortcut = (shortcut: KeyboardShortcut, aria = false): string => {
    const key = keyLabels[shortcut.code] ?? shortcut.code.replace(/^(Key|Digit)/, "");
    return [shortcut.ctrl && (aria ? "Control" : "Ctrl"), shortcut.alt && "Alt", shortcut.shift && "Shift", key].filter(Boolean).join("+");
};

export const formatAiChatShortcut = formatKeyboardShortcut;

export const matchesKeyboardShortcut = (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
    if (event.metaKey || event.getModifierState("AltGraph") || event.code !== shortcut.code
        || event.ctrlKey !== shortcut.ctrl || event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) return false;
    if (!shortcut.ctrl && !shortcut.alt && !/^F\d+$/.test(shortcut.code)) {
        const target = event.target;
        if (target instanceof Element && (target.closest('input, textarea, [role="textbox"]')
            || (target.closest("[contenteditable]") as HTMLElement | null)?.isContentEditable)) return false;
    }
    return true;
};

export const matchesAiChatShortcut = matchesKeyboardShortcut;
