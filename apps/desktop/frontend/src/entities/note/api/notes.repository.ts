import { isDesktopRuntime } from "@/shared/lib/desktop";
import * as browserNotesRepository from "./browser-notes.repository";
import * as desktopNotesRepository from "./desktop-notes.repository";
import type { NoteChangeSet, NoteLibrary, NoteLoadIssue, NoteMediaCatalogItem, NoteSaveResult, NoteSummary, NoteSummaryLibrary, StudyNote } from "../model/note";

export const setNotesVaultId = browserNotesRepository.setNotesVaultId;

export const listNotes = (vaultId?: string, external = false): Promise<NoteLibrary> =>
	isDesktopRuntime() ? desktopNotesRepository.listNotes(vaultId, external) : browserNotesRepository.listNotes();
export const streamNoteSummaries = (vaultId: string, observerId: string, external: boolean, resetObserverSnapshot: boolean, onItems: (notes: NoteSummary[]) => void, signal: AbortSignal): Promise<Omit<NoteSummaryLibrary, "notes">> =>
	isDesktopRuntime() ? desktopNotesRepository.streamNoteSummaries(vaultId, observerId, external, resetObserverSnapshot, onItems, signal) : browserNotesRepository.streamNoteSummaries(vaultId, observerId, external, resetObserverSnapshot, onItems, signal);
export const getNote = (vaultId: string, noteId: string, signal?: AbortSignal): Promise<StudyNote> =>
	isDesktopRuntime() ? desktopNotesRepository.getNote(vaultId, noteId, signal) : browserNotesRepository.getNote(vaultId, noteId, signal);

export const listNoteMedia = (): Promise<NoteMediaCatalogItem[]> =>
	isDesktopRuntime() ? desktopNotesRepository.listNoteMedia() : browserNotesRepository.listNoteMedia();
export const notesChanges = (vaultId: string, observerId: string, signal?: AbortSignal): Promise<NoteChangeSet> =>
	isDesktopRuntime() ? desktopNotesRepository.notesChanges(vaultId, observerId, signal) : browserNotesRepository.notesChanges(vaultId, observerId, signal);
export const acknowledgeNoteChanges = (observerId: string, changeToken: string): Promise<void> =>
	isDesktopRuntime() ? desktopNotesRepository.acknowledgeNoteChanges(observerId, changeToken) : browserNotesRepository.acknowledgeNoteChanges(observerId, changeToken);

export const createNote = (title: string): Promise<StudyNote> =>
	isDesktopRuntime() ? desktopNotesRepository.createNote(title) : browserNotesRepository.createNote(title);

export const renameNote = (noteId: string, title: string): Promise<StudyNote[]> =>
	isDesktopRuntime()
		? desktopNotesRepository.renameNote(noteId, title)
		: browserNotesRepository.renameNote(noteId, title);

export const saveNote = (note: StudyNote, expected: StudyNote, vaultId: string): Promise<NoteSaveResult> =>
	isDesktopRuntime() ? desktopNotesRepository.saveNote(note, expected, vaultId) : browserNotesRepository.saveNote(note);

export const deleteNote = (noteId: string): Promise<NoteLoadIssue[]> =>
	isDesktopRuntime() ? desktopNotesRepository.deleteNote(noteId) : browserNotesRepository.deleteNote(noteId);

export const listDeletedNotes = (): Promise<StudyNote[]> =>
	isDesktopRuntime() ? desktopNotesRepository.listDeletedNotes() : browserNotesRepository.listDeletedNotes();

export const listDeletedNoteIds = (vaultId: string, signal?: AbortSignal): Promise<string[]> =>
	isDesktopRuntime() ? desktopNotesRepository.listDeletedNoteIds(vaultId, signal) : browserNotesRepository.listDeletedNoteIds(vaultId, signal);

export const restoreDeletedNote = (noteId: string): Promise<NoteSaveResult> =>
	isDesktopRuntime() ? desktopNotesRepository.restoreDeletedNote(noteId) : browserNotesRepository.restoreDeletedNote(noteId);
