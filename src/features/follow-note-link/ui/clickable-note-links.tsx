import { For, type Component } from "solid-js";
import type { StudyNote } from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { ClickableLinkArea } from "../model/clickable-links.controller";
import { styles } from "./style.css";

export const ClickableNoteLinks: Component<{
	areas: ClickableLinkArea[];
	onOpenNote: (note: StudyNote) => void;
	onOpenExternalUrl: (url: string) => void;
}> = (props) => (
	<div class={styles.root}>
		<For each={props.areas}>{(area) => (
			<a class={styles.link} href={area.note ? `#${area.note.id}` : area.link.kind === "external" ? area.link.url : undefined}
				title={area.note?.title ?? area.link.label} aria-label={area.link.label} tabIndex={-1}
				target={!area.note && !isTauriRuntime() ? "_blank" : undefined} rel="noopener noreferrer"
				style={{ left: `${area.left}px`, top: `${area.top}px`, width: `${area.width}px`, height: `${area.height}px` }}
				onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
				onContextMenu={(event) => event.preventDefault()}
				onClick={(event) => {
					if (!event.ctrlKey) { event.preventDefault(); return; }
					if (area.note) { event.preventDefault(); props.onOpenNote(area.note); }
					else if (area.link.kind === "external" && isTauriRuntime()) {
						event.preventDefault(); props.onOpenExternalUrl(area.link.url);
					}
				}} />
		)}</For>
	</div>
);
