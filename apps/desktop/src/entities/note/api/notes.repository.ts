import { isTauriRuntime } from "@/shared/lib/tauri";
import * as browserNotesRepository from "./browser-notes.repository";
import * as tauriNotesRepository from "./tauri-notes.repository";
import type { NoteChangeSet, NoteLibrary, NoteLoadIssue, NoteMediaCatalogItem, NoteSaveResult, NoteSummary, NoteSummaryLibrary, StudyNote } from "../model/note";

export const setNotesVaultId = browserNotesRepository.setNotesVaultId;

export const listNotes = (vaultId?: string, external = false): Promise<NoteLibrary> =>
	isTauriRuntime() ? tauriNotesRepository.listNotes(vaultId, external) : browserNotesRepository.listNotes();
export const streamNoteSummaries = (vaultId: string, observerId: string, external: boolean, resetObserverSnapshot: boolean, onItems: (notes: NoteSummary[]) => void): Promise<Omit<NoteSummaryLibrary, "notes">> =>
	isTauriRuntime() ? tauriNotesRepository.streamNoteSummaries(vaultId, observerId, external, resetObserverSnapshot, onItems) : browserNotesRepository.streamNoteSummaries(vaultId, observerId, external, resetObserverSnapshot, onItems);
export const getNote = (vaultId: string, noteId: string): Promise<StudyNote> =>
	isTauriRuntime() ? tauriNotesRepository.getNote(vaultId, noteId) : browserNotesRepository.getNote(vaultId, noteId);

export const listNoteMedia = (): Promise<NoteMediaCatalogItem[]> =>
	isTauriRuntime() ? tauriNotesRepository.listNoteMedia() : browserNotesRepository.listNoteMedia();
export const notesChanges = (vaultId: string, observerId: string): Promise<NoteChangeSet> =>
	isTauriRuntime() ? tauriNotesRepository.notesChanges(vaultId, observerId) : browserNotesRepository.notesChanges(vaultId, observerId);
export const acknowledgeNoteChanges = (observerId: string, changeToken: string): Promise<void> =>
	isTauriRuntime() ? tauriNotesRepository.acknowledgeNoteChanges(observerId, changeToken) : browserNotesRepository.acknowledgeNoteChanges(observerId, changeToken);

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

export const listDeletedNoteIds = (): Promise<string[]> =>
	isTauriRuntime() ? tauriNotesRepository.listDeletedNoteIds() : browserNotesRepository.listDeletedNoteIds();

export const restoreDeletedNote = (noteId: string): Promise<NoteSaveResult> =>
	isTauriRuntime() ? tauriNotesRepository.restoreDeletedNote(noteId) : browserNotesRepository.restoreDeletedNote(noteId);
