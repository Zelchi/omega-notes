import Button from "@/shared/ui/button";
import { displayNoteTitle } from "@/entities/note";
import { For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import type { NoteSummary } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css";

export const NoteLinkSuggestions: Component<{
	id: string;
	anchor: { left: number; top: number; height: number };
	notes: NoteSummary[];
	selectedIndex: number;
	t: (key: TranslationKey) => string;
	onSelect: (note: NoteSummary) => void;
}> = (props) => {
	const width = () => Math.min(260, innerWidth - 16);
	const height = () => Math.max(1, props.notes.length) * 32 + 10;
	const top = () => props.anchor.top >= height() + 16
		? props.anchor.top - height() - 8
		: Math.max(8, Math.min(innerHeight - height() - 8, props.anchor.top + props.anchor.height + 8));
	return <Portal>
		<div class={styles.root} id={props.id} role="listbox" aria-label={props.t("noteLinkSuggestions")}
			style={{ left: `${Math.max(8, Math.min(innerWidth - width() - 8, props.anchor.left - width() / 2))}px`,
				top: `${top()}px`, width: `${width()}px` }}
			onPointerDown={(event) => event.preventDefault()}
			onContextMenu={(event) => event.preventDefault()}>
			<Show when={props.notes.length} fallback={<div class={styles.empty} role="status">{props.t("noNoteLinkSuggestions")}</div>}>
				<For each={props.notes}>{(note, index) => (
					<Button id={`${props.id}-${note.id}`} class={cx(styles.option, index() === props.selectedIndex && styles.selected)}
						type="button" role="option" aria-selected={index() === props.selectedIndex} tabIndex={-1}
						onClick={() => props.onSelect(note)}>
						<Icon name="link" size={15} /><span class={styles.title}>{displayNoteTitle(note)}</span>
					</Button>
				)}</For>
			</Show>
		</div>
	</Portal>;
};
