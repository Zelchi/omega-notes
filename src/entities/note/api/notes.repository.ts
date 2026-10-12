import { isTauriRuntime } from "@/shared/lib/tauri";
import * as browserNotesRepository from "./browser-notes.repository";
import * as tauriNotesRepository from "./tauri-notes.repository";
import type { NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote } from "../model/note";

export const setNotesVaultId = browserNotesRepository.setNotesVaultId;

export const listNotes = (): Promise<NoteLibrary> =>
	isTauriRuntime() ? tauriNotesRepository.listNotes() : browserNotesRepository.listNotes();

export const createNote = (title: string): Promise<StudyNote> =>
	isTauriRuntime() ? tauriNotesRepository.createNote(title) : browserNotesRepository.createNote(title);

export const renameNote = (noteId: string, title: string): Promise<StudyNote[]> =>
	isTauriRuntime()
		? tauriNotesRepository.renameNote(noteId, title)
		: browserNotesRepository.renameNote(noteId, title);

export const saveNote = (note: StudyNote): Promise<NoteSaveResult> =>
	isTauriRuntime() ? tauriNotesRepository.saveNote(note) : browserNotesRepository.saveNote(note);

export const deleteNote = (noteId: string): Promise<NoteLoadIssue[]> =>
	isTauriRuntime() ? tauriNotesRepository.deleteNote(noteId) : browserNotesRepository.deleteNote(noteId);
