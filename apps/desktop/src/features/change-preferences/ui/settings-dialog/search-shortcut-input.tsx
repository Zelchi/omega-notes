import Button from "@/shared/ui/button";
import { createSignal, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { formatSearchShortcut, isSearchShortcut, type SearchShortcut } from "../../model/search-shortcut";
import { styles } from "./style.css.ts";

const SearchShortcutInput: Component<{
	value: SearchShortcut;
	onChange: (shortcut: SearchShortcut) => void;
	t: (key: TranslationKey) => string;
}> = (props) => {
	const [recording, setRecording] = createSignal(false);
	const [reserved, setReserved] = createSignal(false);
	return <Button id="settings-searchShortcut" class={styles.shortcutInput} type="button"
		aria-label={props.t("searchFocusShortcut")} aria-pressed={recording()}
		onClick={() => { setReserved(false); setRecording((value) => !value); }}
		onBlur={() => { setRecording(false); setReserved(false); }}
		onKeyDown={(event) => {
			if (!recording()) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") { setRecording(false); setReserved(false); return; }
			if (event.repeat || event.isComposing || event.metaKey || event.getModifierState("AltGraph")) return;
			const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
			if (!isSearchShortcut(shortcut)) {
				if (event.code === "KeyA" && event.ctrlKey && !event.altKey && !event.shiftKey) setReserved(true);
				return;
			}
			props.onChange(shortcut);
			setRecording(false);
			setReserved(false);
		}}>
		{recording() ? props.t(reserved() ? "aiChatShortcutReserved" : "aiChatShortcutRecord") : formatSearchShortcut(props.value)}
	</Button>;
};

export default SearchShortcutInput;
