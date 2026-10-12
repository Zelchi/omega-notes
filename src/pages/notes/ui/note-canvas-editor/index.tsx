import { createMemo, Index, Show, type Component } from "solid-js";
import {
	createNoteTitleIndex,
	normalizeNoteTitle,
	type NoteImageElement,
	type NoteMediaElement,
	type NoteTextElement,
} from "@/entities/note";
import { renderNoteText } from "./render-text";
import EditorContextMenu from "../editor-context-menu";
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
	const toolbar = createPresence(() => editor.editable() && !editor.positioningElementId(), 220);
	const notesByTitle = createMemo(() => createNoteTitleIndex(props.notes));
	const notesById = createMemo(() => new Map(props.notes.map((note) => [normalizeNoteTitle(note.id), note])));
	const renderText = (text: string, format?: FormattedFragment) =>
		renderNoteText(text, {
			notesById: notesById(),
			notesByTitle: notesByTitle(),
			onOpenNote: props.onOpenNote,
			onOpenExternalUrl: editor.openExternalLink,
		}, format);

	return (
		<div class={styles.host}>
			<Show when={toolbar.present()}>
				<NoteEditingToolbar
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
				ref={editor.setPaper}
				style={{ width: `${props.document.page.width}px`, height: `${editor.renderedPageHeight()}px` }}
				onContextMenu={editor.openContextMenu}
			>
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
													onInteractionStart={() => editor.setContextMenu(undefined)}
													onContextMenu={editor.openMediaContextMenu}
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
											onContextMenu={editor.openImageContextMenu}
											onInteractionStart={() => editor.setContextMenu(undefined)}
										/>
									</Show>
								}
							>
								<NoteTextNode
									element={() => getElement() as NoteTextElement}
									wraps={editor.positionedElementsOnPage}
									onHeightChange={editor.setTextContentBottom}
									editable={editor.editable() && !editor.positioningElementId()}
									locked={editor.editable() && Boolean(editor.positioningElementId())}
									renderText={renderText}
									onChange={editor.updateText}
									onFormattingReady={editor.setTextFormatHandler}
								/>
							</Show>
						);
					}}
				</Index>
			</div>
			<Show when={editor.contextMenu()}>
				{(menu) => (
					<EditorContextMenu
						x={menu().x}
						y={menu().y}
						t={props.t}
						onClose={() => editor.setContextMenu(undefined)}
						onAttach={menu().kind === "note" ? editor.showMediaCatalog : undefined}
						onPosition={
							(menu().kind === "image" || menu().kind === "media") && !editor.positioningElementId()
								? () => editor.positionElement(menu().elementId!)
								: undefined
						}
						onPlace={
							(menu().kind === "image" || menu().kind === "media") &&
							editor.positioningElementId() === menu().elementId
								? editor.placeElement
								: undefined
						}
						onRemove={
							(menu().kind === "image" || menu().kind === "media") &&
							editor.positioningElementId() === menu().elementId
								? editor.removeElement
								: undefined
						}
						onDelete={
							(menu().kind === "media" || menu().kind === "image") && !editor.positioningElementId()
								? editor.removeElement
								: undefined
						}
					/>
				)}
			</Show>
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
