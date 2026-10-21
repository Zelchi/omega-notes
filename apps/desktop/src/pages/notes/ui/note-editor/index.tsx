import Input from "@/shared/ui/input";
import { NOTE_TITLE_MAX_LENGTH } from "@/entities/note";
import { Show, type Component } from "solid-js";
import NoteCanvasEditor from "../note-canvas-editor";
import { useNoteEditorController, type NoteEditorProps } from "./controller";
import { styles } from "./style.css.ts";

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
					{editor.visibleTitle() || " "}
				</span>
				<Show
					when={props.mode === "edit"}
					fallback={
						<h1 class={styles.titleDisplay} tabIndex={0} onKeyDown={editor.onDisplayTitleKeyDown}>
							{editor.displayTitle()}
						</h1>
					}
				>
					<Input
						class={styles.title}
						value={editor.titleDraft()}
						maxLength={NOTE_TITLE_MAX_LENGTH}
						disabled={editor.positioningElement() || editor.savingTitle()}
						onInput={(event) => editor.onTitleInput(event.currentTarget.value)}
						onBlur={() => void editor.onTitleBlur()}
						onKeyDown={editor.onEditTitleKeyDown}
						aria-label={props.t("noteTitle")}
					/>
				</Show>
				<Show when={editor.visibleTitleError()}>
					<span class={styles.titleError} role="alert">
						{editor.visibleTitleError()}
					</span>
				</Show>
			</div>
			<NoteCanvasEditor
				noteId={props.note.id}
				document={props.note.document}
				notes={props.notes}
				loadAllNotes={props.loadAllNotes}
				releaseLoadedNotes={props.releaseLoadedNotes}
				referenceTitles={props.referenceTitles}
				mode={props.mode}
				t={props.t}
				onChange={props.onDocumentChange}
				onDelete={props.onDelete}
				deleteDisabled={props.deleteDisabled}
				onOpenNote={props.onOpenNote}
				onOpenMissingNote={props.onOpenMissingNote}
				onPositioningChange={editor.setPositioningElement}
			/>
		</section>
	);
};

export default NoteEditor;
