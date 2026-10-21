import { createMemo, For, Index, lazy, Show, Suspense, type Component } from "solid-js";
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
import NoteTextNode from "../note-text-node";
import NoteEditingToolbar from "../note-editing-toolbar";
import { useNoteCanvasEditorController, type NoteCanvasEditorProps } from "./controller";
import { styles } from "./style.css.ts";
import type { FormattedFragment } from "@/features/format-text";
import { createPresence } from "@/shared/lib/presence";
import { useMediaCatalogDialogController } from "../media-catalog-dialog/controller";

const MediaCatalogDialog = lazy(() => import("../media-catalog-dialog"));
const NoteImageNode = lazy(() => import("../note-image-node"));
const NoteMediaNode = lazy(() => import("../note-media-node"));

const NoteCanvasEditor: Component<NoteCanvasEditorProps> = (props) => {
	const editor = useNoteCanvasEditorController(props);
	const find = useFindInNote(() => props.noteId);
	const mediaCatalogPresence = createPresence(editor.catalogOpen, 210);
	const mediaCatalog = useMediaCatalogDialogController({
		get open() { return mediaCatalogPresence.present(); },
		loadNotes: props.loadAllNotes,
		releaseLoadedNotes: props.releaseLoadedNotes,
		t: props.t,
		onClose: () => editor.setCatalogOpen(false),
		onSelect: (media) => editor.insertMedia([media]),
		onImportFiles: editor.importFiles,
		onImportPaths: editor.importPaths,
	});
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
					onDelete={props.onDelete}
					deleteDisabled={props.deleteDisabled}
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
												<Suspense fallback={null}>
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
												</Suspense>
											</Show>
										}
									>
										<Suspense fallback={null}>
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
										</Suspense>
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
			<Show when={mediaCatalogPresence.present()}>
				<Suspense fallback={null}>
					<MediaCatalogDialog
						open={editor.catalogOpen()}
						exiting={mediaCatalogPresence.exiting()}
						catalog={mediaCatalog}
						t={props.t}
					/>
				</Suspense>
			</Show>
		</div>
	);
};

export default NoteCanvasEditor;
