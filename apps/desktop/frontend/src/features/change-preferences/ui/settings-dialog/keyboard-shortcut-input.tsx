import Button from "@/shared/ui/button";
import { createSignal, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { formatKeyboardShortcut, isKeyboardShortcut, type KeyboardShortcut } from "../../model/ai-chat-shortcut";
import { styles } from "./style.css.ts";

const KeyboardShortcutInput: Component<{
	id: string;
	label: TranslationKey;
	value: KeyboardShortcut;
	onChange: (shortcut: KeyboardShortcut) => boolean;
	t: (key: TranslationKey) => string;
}> = (props) => {
	const [recording, setRecording] = createSignal(false);
	const [feedback, setFeedback] = createSignal<"reserved" | "conflict">();
	return <Button id={props.id} class={styles.shortcutInput} type="button"
		aria-label={props.t(props.label)} aria-pressed={recording()}
		onClick={() => { setFeedback(); setRecording((value) => !value); }}
		onBlur={() => { setRecording(false); setFeedback(); }}
		onKeyDown={(event) => {
			if (!recording()) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") { setRecording(false); setFeedback(); return; }
			if (event.repeat || event.isComposing || event.metaKey || event.getModifierState("AltGraph")) return;
			const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
			if (!isKeyboardShortcut(shortcut)) {
				if (event.code === "KeyA" && event.ctrlKey && !event.altKey && !event.shiftKey) setFeedback("reserved");
				return;
			}
			if (!props.onChange(shortcut)) { setFeedback("conflict"); return; }
			setRecording(false);
			setFeedback();
		}}>
		{recording() ? props.t(feedback() === "reserved" ? "aiChatShortcutReserved" : feedback() === "conflict" ? "shortcutConflict" : "aiChatShortcutRecord") : formatKeyboardShortcut(props.value)}
	</Button>;
};

export default KeyboardShortcutInput;
