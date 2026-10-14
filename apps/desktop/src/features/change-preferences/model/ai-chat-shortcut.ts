export type AiChatShortcut = { code: string; ctrl: boolean; alt: boolean; shift: boolean };

export const DEFAULT_AI_CHAT_SHORTCUT: AiChatShortcut = { code: "KeyJ", ctrl: true, alt: false, shift: false };

const keyCodes = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|IntlBackslash|IntlRo|IntlYen|Semicolon|Quote|Comma|Period|Slash)$/;
const keyLabels: Record<string, string> = {
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};

export const isAiChatShortcut = (value: unknown): value is AiChatShortcut => {
    if (!value || typeof value !== "object") return false;
    const shortcut = value as AiChatShortcut;
    return typeof shortcut.code === "string" && keyCodes.test(shortcut.code)
        && typeof shortcut.ctrl === "boolean" && typeof shortcut.alt === "boolean" && typeof shortcut.shift === "boolean"
        && !(shortcut.code === "KeyA" && shortcut.ctrl && !shortcut.alt && !shortcut.shift);
};

export const formatAiChatShortcut = (shortcut: AiChatShortcut, aria = false): string => {
    const key = keyLabels[shortcut.code] ?? shortcut.code.replace(/^(Key|Digit)/, "");
    return [shortcut.ctrl && (aria ? "Control" : "Ctrl"), shortcut.alt && "Alt", shortcut.shift && "Shift", key].filter(Boolean).join("+");
};

export const matchesAiChatShortcut = (event: KeyboardEvent, shortcut: AiChatShortcut): boolean => {
    if (event.metaKey || event.getModifierState("AltGraph") || event.code !== shortcut.code
        || event.ctrlKey !== shortcut.ctrl || event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) return false;
    if (!shortcut.ctrl && !shortcut.alt && !/^F\d+$/.test(shortcut.code)) {
        const target = event.target;
        if (target instanceof Element && (target.closest('input, textarea, [role="textbox"]')
            || (target.closest("[contenteditable]") as HTMLElement | null)?.isContentEditable)) return false;
    }
    return true;
};
