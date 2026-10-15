import { createMemo, For, Index, Show, type Component } from "solid-js";
import { useFindInNote } from "@/features/find-in-note";
import { cx } from "@/shared/lib/classes";
import {
	createNoteTitleIndex,
	normalizeNoteTitle,
	type NoteImageElement,
	type NoteMediaElement,
	type NoteTextElement,
} from "@/entities/note";
import { renderNoteText } from "./render-text";
import MediaCatalogDialog from "../media-catalog-dialog";
import NoteImageNode from "../note-image-node";
import NoteMediaNode from "../note-media-node";
import NoteTextNode from "../note-text-node";
import NoteEditingToolbar from "../note-editing-toolbar";
import { useNoteCanvasEditorController, type NoteCanvasEditorProps } from "./controller";
import { styles } from "./style.css.ts";
import type { FormattedFragment } from "@/features/format-text";
import { createPresence } from "@/shared/lib/presence";

const NoteCanvasEditor: Component<NoteCanvasEditorProps> = (props) => {
	const editor = useNoteCanvasEditorController(props);
	const find = useFindInNote(() => props.noteId);
	const toolbar = createPresence(() => (editor.editable() || find.open()) && !editor.positioningElementId(), 220);
	const notesByTitle = createMemo(() => createNoteTitleIndex(props.notes));
	const notesById = createMemo(() => new Map(props.notes.map((note) => [normalizeNoteTitle(note.id), note])));
	const rememberedTitles = createMemo(() => {
		const titles = new Map<string, string>();
		for (const [id, title] of Object.entries(props.referenceTitles)) {
			if (notesById().has(normalizeNoteTitle(id))) continue;
			titles.set(normalizeNoteTitle(id), title);
			if (!titles.has(normalizeNoteTitle(title))) titles.set(normalizeNoteTitle(title), title);
		}
		return titles;
	});
	const renderText = (text: string, format?: FormattedFragment, onToggleTask?: (sourceLine: number, checked: boolean) => void) =>
		renderNoteText(text, {
			notesById: notesById(),
			notesByTitle: notesByTitle(),
			rememberedTitles: rememberedTitles(),
			onOpenNote: props.onOpenNote,
			onOpenMissingNote: onToggleTask ? props.onOpenMissingNote : undefined,
			onOpenExternalUrl: editor.openExternalLink,
			t: props.t, onToggleTask,
		}, format);

	return (
		<div class={styles.host}>
			<Show when={toolbar.present()}>
				<NoteEditingToolbar
					find={find}
					readOnly={!editor.editable()}
					onExportPdf={props.onExportPdf}
					exportPdfDisabled={props.exportPdfDisabled}
					exiting={toolbar.exiting()}
					t={props.t}
					alignment={editor.textAlignment()}
					onAttachMedia={editor.showMediaCatalog}
					onAlignmentChange={editor.updateTextAlignment}
					onFormat={editor.formatText}
				/>
			</Show>
			<div
				class={styles.paper}
				ref={(element) => { editor.setPaper(element); find.setRoot(element); }}
				style={{
					width: `${props.document.page.width}px`,
					height: `${editor.renderedPageHeight()}px`,
					cursor: editor.editable() && !editor.positioningElementId() ? "text" : "default",
				}}
				onContextMenu={(event) => event.preventDefault()}
			>
				<div class={styles.findHighlights} aria-hidden="true" data-note-find-ui>
					<For each={find.markers()}>{(marker) => <span class={cx(styles.findMatch, marker.match === find.active() && styles.activeFindMatch)}
						style={{ left: `${marker.left}px`, top: `${marker.top}px`, width: `${marker.width}px`, height: `${marker.height}px` }} />}</For>
				</div>
				<Show when={editor.pasteError()}>
					<p role="alert" class={styles.pasteError}>{props.t("pasteImageFailed")}</p>
				</Show>
				<Index each={editor.flowDocument().elements}>
					{(element) => {
						const getElement = () => element();
						return (
							<Show
								when={getElement().type === "text"}
								fallback={
									<Show
										when={getElement().type === "image"}
										fallback={
											<Show when={getElement().type === "audio" || getElement().type === "video"}>
												<NoteMediaNode
													element={() => getElement() as NoteMediaElement}
													pageWidth={props.document.page.width}
													pageHeight={editor.renderedPageHeight()}
													editable={editor.editable()}
													activePositioningId={editor.positioningElementId()}
													t={props.t}
													onChange={editor.updateElement}
													onPreview={editor.setPreviewElement}
													onContextMenu={editor.startMediaPositioning}
													onConfirm={editor.placeElement}
													onDelete={() => editor.removeElement(getElement().id)}
												/>
											</Show>
										}
									>
										<NoteImageNode
											element={() => getElement() as NoteImageElement}
											pageWidth={props.document.page.width}
											pageHeight={editor.renderedPageHeight()}
											editable={editor.editable()}
											activePositioningId={editor.positioningElementId()}
											t={props.t}
											onChange={editor.updateElement}
											onPreview={editor.setPreviewElement}
											onContextMenu={editor.startMediaPositioning}
											onConfirm={editor.placeElement}
											onDelete={() => editor.removeElement(getElement().id)}
										/>
									</Show>
								}
							>
								<NoteTextNode
									element={() => getElement() as NoteTextElement}
									notes={props.notes}
									t={props.t}
									onOpenNote={props.onOpenNote}
									onOpenExternalUrl={editor.openExternalLink}
									wraps={editor.positionedElementsOnPage}
									onHeightChange={editor.setTextContentBottom}
									editable={editor.editable() && !editor.positioningElementId()}
									locked={editor.editable() && Boolean(editor.positioningElementId())}
									renderText={renderText}
									onChange={editor.updateText}
									onPasteImages={editor.pasteImages}
									onFormattingReady={editor.setTextFormatHandler}
									onAlignmentReady={editor.setTextAlignmentHandler}
									onSelectionAlignmentChange={editor.setTextAlignment}
								/>
							</Show>
						);
					}}
				</Index>
			</div>
			<MediaCatalogDialog
				open={editor.catalogOpen()}
				notes={props.notes}
				t={props.t}
				onClose={() => editor.setCatalogOpen(false)}
				onSelect={(media) => editor.insertMedia([media])}
				onImportFiles={editor.importFiles}
				onImportPaths={editor.importPaths}
			/>
		</div>
	);
};

export default NoteCanvasEditor;
