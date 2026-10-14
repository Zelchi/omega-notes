import { createSignal, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { formatAiChatShortcut, isAiChatShortcut, type AiChatShortcut } from "../../model/ai-chat-shortcut";
import { styles } from "./style.css.ts";

const AiChatShortcutInput: Component<{
    value: AiChatShortcut;
    onChange: (shortcut: AiChatShortcut) => void;
    t: (key: TranslationKey) => string;
}> = (props) => {
    const [recording, setRecording] = createSignal(false);
    const [reserved, setReserved] = createSignal(false);
    return <button id="settings-aiChatShortcut" class={styles.shortcutInput} type="button"
        aria-label={props.t("aiChatShortcut")} aria-pressed={recording()}
        onClick={() => { setReserved(false); setRecording((value) => !value); }}
        onBlur={() => { setRecording(false); setReserved(false); }}
        onKeyDown={(event) => {
            if (!recording()) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === "Escape") { setRecording(false); setReserved(false); return; }
            if (event.repeat || event.isComposing || event.metaKey || event.getModifierState("AltGraph")) return;
            const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
            if (!isAiChatShortcut(shortcut)) {
                if (event.code === "KeyA" && event.ctrlKey && !event.altKey && !event.shiftKey) setReserved(true);
                return;
            }
            props.onChange(shortcut);
            setRecording(false);
            setReserved(false);
        }}>
        {recording() ? props.t(reserved() ? "aiChatShortcutReserved" : "aiChatShortcutRecord") : formatAiChatShortcut(props.value)}
    </button>;
};

export default AiChatShortcutInput;
