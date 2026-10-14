import { invoke } from "@tauri-apps/api/core";
import type { NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote } from "../model/note";

export const listNotes = (): Promise<NoteLibrary> => invoke<NoteLibrary>("list_notes");

export const createNote = (title: string): Promise<StudyNote> => invoke<StudyNote>("create_note", { noteTitle: title });

export const renameNote = (noteId: string, title: string): Promise<StudyNote[]> =>
	invoke<StudyNote[]>("rename_note", { noteId, noteTitle: title });

export const saveNote = (note: StudyNote): Promise<NoteSaveResult> =>
	invoke<NoteSaveResult>("save_note", {
		noteId: note.id,
		noteTitle: note.title,
		document: note.document,
	});

export const deleteNote = (noteId: string): Promise<NoteLoadIssue[]> =>
	invoke<NoteLoadIssue[]>("delete_note", { noteId });

export const listDeletedNotes = (): Promise<StudyNote[]> => invoke("list_deleted_notes");

export const restoreDeletedNote = (noteId: string): Promise<NoteSaveResult> =>
	invoke("restore_deleted_note", { noteId });
