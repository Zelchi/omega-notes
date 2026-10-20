import { isTauriRuntime } from "@/shared/lib/tauri";
import * as browserNotesRepository from "./browser-notes.repository";
import * as tauriNotesRepository from "./tauri-notes.repository";
import type { NoteLibrary, NoteLoadIssue, NoteSaveResult, StudyNote } from "../model/note";

export const setNotesVaultId = browserNotesRepository.setNotesVaultId;

export const listNotes = (vaultId?: string, external = false): Promise<NoteLibrary> =>
	isTauriRuntime() ? tauriNotesRepository.listNotes(vaultId, external) : browserNotesRepository.listNotes();
export const notesRevision = (vaultId: string): Promise<string> =>
	isTauriRuntime() ? tauriNotesRepository.notesRevision(vaultId) : Promise.resolve("");

export const createNote = (title: string): Promise<StudyNote> =>
	isTauriRuntime() ? tauriNotesRepository.createNote(title) : browserNotesRepository.createNote(title);

export const renameNote = (noteId: string, title: string): Promise<StudyNote[]> =>
	isTauriRuntime()
		? tauriNotesRepository.renameNote(noteId, title)
		: browserNotesRepository.renameNote(noteId, title);

export const saveNote = (note: StudyNote, expected: StudyNote, vaultId: string): Promise<NoteSaveResult> =>
	isTauriRuntime() ? tauriNotesRepository.saveNote(note, expected, vaultId) : browserNotesRepository.saveNote(note);

export const deleteNote = (noteId: string): Promise<NoteLoadIssue[]> =>
	isTauriRuntime() ? tauriNotesRepository.deleteNote(noteId) : browserNotesRepository.deleteNote(noteId);

export const listDeletedNotes = (): Promise<StudyNote[]> =>
	isTauriRuntime() ? tauriNotesRepository.listDeletedNotes() : browserNotesRepository.listDeletedNotes();

export const restoreDeletedNote = (noteId: string): Promise<NoteSaveResult> =>
	isTauriRuntime() ? tauriNotesRepository.restoreDeletedNote(noteId) : browserNotesRepository.restoreDeletedNote(noteId);
