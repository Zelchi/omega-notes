import { Show, type Component } from "solid-js";
import NoteCanvasEditor from "../note-canvas-editor";
import { useNoteEditorController, type NoteEditorProps } from "./controller";
import { styles } from "./style.css.ts";
import { exportNote } from "../../lib/export-note";
import { EXPORT_PDF_ENABLED } from "@/features/export-note-pdf";

const NoteEditor: Component<NoteEditorProps> = (props) => {
	const editor = useNoteEditorController(props);

	return (
		<section class={styles.root}>
			<div
				ref={editor.setHeadingElement}
				class={styles.heading}
				style={{ "--note-title-fit-size": `${editor.titleFontSize()}px` }}
			>
				<span ref={editor.setMeasureElement} class={styles.titleMeasure} aria-hidden="true">
					{props.note.title || " "}
				</span>
				<Show
					when={props.mode === "edit"}
					fallback={
						<h1 class={styles.titleDisplay} tabIndex={0} onKeyDown={editor.onDisplayTitleKeyDown}>
							{props.note.title}
						</h1>
					}
				>
					<input
						class={styles.title}
						value={editor.titleDraft()}
						disabled={editor.positioningElement() || editor.savingTitle()}
						onInput={(event) => editor.onTitleInput(event.currentTarget.value)}
						onBlur={() => void editor.onTitleBlur()}
						onKeyDown={editor.onEditTitleKeyDown}
						aria-label={props.t("noteTitle")}
					/>
				</Show>
				<Show when={editor.titleError()}>
					<span class={styles.titleError} role="alert">
						{editor.titleError()}
					</span>
				</Show>
			</div>
			<NoteCanvasEditor
				exportPdfDisabled={editor.positioningElement() || editor.savingTitle()}
				onExportPdf={EXPORT_PDF_ENABLED ? async () => {
					await editor.onTitleBlur();
					if (editor.titleError()) throw new Error(editor.titleError());
					await exportNote(props.note, props.notes, props.t);
				} : undefined}
				document={props.note.document}
				notes={props.notes}
				mode={props.mode}
				t={props.t}
				onChange={props.onDocumentChange}
				onOpenNote={props.onOpenNote}
				onPositioningChange={editor.setPositioningElement}
			/>
		</section>
	);
};

export default NoteEditor;
