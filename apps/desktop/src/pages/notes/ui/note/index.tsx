import { Show, type Component } from "solid-js";
import type { StudyNote } from "@/entities/note";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import NoteEditor from "../note-editor";
import type { NoteEditorProps } from "../note-editor/controller";

type NoteProps = Omit<NoteEditorProps, "note"> & {
	note: StudyNote | undefined;
};

const Note: Component<NoteProps> = (props) => (
	<CustomScrollArea accelerateScrollWithAlt>
		<Show when={props.note} fallback={<div aria-busy="true" />}>
			{(note) => (
				<NoteEditor
					note={note()}
					notes={props.notes}
					referenceTitles={props.referenceTitles}
					mode={props.mode}
					t={props.t}
					onTitleChange={props.onTitleChange}
					onDocumentChange={props.onDocumentChange}
					onDelete={props.onDelete}
					deleteDisabled={props.deleteDisabled}
					onOpenNote={props.onOpenNote}
					onOpenMissingNote={props.onOpenMissingNote}
					onRegisterBeforeShutdown={props.onRegisterBeforeShutdown}
				/>
			)}
		</Show>
	</CustomScrollArea>
);

export default Note;
