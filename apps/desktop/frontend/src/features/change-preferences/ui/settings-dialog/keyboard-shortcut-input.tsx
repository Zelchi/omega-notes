import Button from "@/shared/ui/button";
import { createSignal, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { formatKeyboardShortcut, isKeyboardShortcut, type KeyboardShortcut } from "../../model/ai-chat-shortcut";
import { styles } from "./style.css.ts";

const KeyboardShortcutInput: Component<{
	id: string;
	label: TranslationKey;
	value: KeyboardShortcut;
	onChange: (shortcut: KeyboardShortcut) => void;
	t: (key: TranslationKey) => string;
}> = (props) => {
	const [recording, setRecording] = createSignal(false);
	const [reserved, setReserved] = createSignal(false);
	return <Button id={props.id} class={styles.shortcutInput} type="button"
		aria-label={props.t(props.label)} aria-pressed={recording()}
		onClick={() => { setReserved(false); setRecording((value) => !value); }}
		onBlur={() => { setRecording(false); setReserved(false); }}
		onKeyDown={(event) => {
			if (!recording()) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") { setRecording(false); setReserved(false); return; }
			if (event.repeat || event.isComposing || event.metaKey || event.getModifierState("AltGraph")) return;
			const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
			if (!isKeyboardShortcut(shortcut)) {
				if (event.code === "KeyA" && event.ctrlKey && !event.altKey && !event.shiftKey) setReserved(true);
				return;
			}
			props.onChange(shortcut);
			setRecording(false);
			setReserved(false);
		}}>
		{recording() ? props.t(reserved() ? "aiChatShortcutReserved" : "aiChatShortcutRecord") : formatKeyboardShortcut(props.value)}
	</Button>;
};

export default KeyboardShortcutInput;
