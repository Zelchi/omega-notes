import { batch, createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { isNoteTitleAvailable, type NotesLibrary, type NoteDocument, type StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { playSound } from "@/shared/ui/sound";
import { createNavigationHistory, findHistoryIndex, recordNavigation, type NavigationHistory, type NavigationLocation } from "./navigation-history";

type NoteRoute = "canvas" | "note";
type NoteMode = "edit" | "view";
type NameDialogMode = "create" | "rename" | undefined;

type NoteNavigationDependencies = {
	notes: NotesLibrary;
	activeVaultId: Accessor<string | undefined>;
	centerCanvasOnLaunch: Accessor<boolean>;
	t: (key: TranslationKey) => string;
};

export const useNoteNavigationController = (dependencies: NoteNavigationDependencies) => {
	const notes = dependencies.notes;
	const t = dependencies.t;
	const [selectedId, setSelectedId] = createSignal<string>();
	const selectedNote = createMemo(() => notes.notes().find((note) => note.id === selectedId()));
	const [route, setRoute] = createSignal<NoteRoute>("canvas");
	const [mode, setMode] = createSignal<NoteMode>("edit");
	const [centeredAtLaunch, setCenteredAtLaunch] = createSignal(false);
	const [nameDialog, setNameDialog] = createSignal<NameDialogMode>();
	const [nameDialogTitle, setNameDialogTitle] = createSignal("");
	const [nameDialogError, setNameDialogError] = createSignal<string | undefined>(undefined, { equals: false });
	const [renameTargetId, setRenameTargetId] = createSignal<string>();
	const [savingName, setSavingName] = createSignal(false);
	let resolveCreateNote: ((note: StudyNote | undefined) => void) | undefined;
	const histories = new Map<string, NavigationHistory>();
	const lastNotes = new Map<string, string>();
	const [history, setHistory] = createSignal(createNavigationHistory());
	const [navigating, setNavigating] = createSignal(false);
	const noteIds = createMemo(() => new Set(notes.notes().map((note) => note.id)));
	let disposed = false;
	onCleanup(() => { disposed = true; });
	const storeHistory = (next: NavigationHistory): void => {
		const vaultId = dependencies.activeVaultId();
		if (vaultId) histories.set(vaultId, next);
		setHistory(next);
	};

	createEffect(() => {
		const vaultId = dependencies.activeVaultId();
		untrack(() => batch(() => {
			storeHistory(recordNavigation(vaultId ? histories.get(vaultId) ?? createNavigationHistory() : createNavigationHistory(), { route: "canvas" }));
			setSelectedId(vaultId ? lastNotes.get(vaultId) : undefined);
			setRoute("canvas");
		}));
	});

	const createNoteAtCanvas = async (): Promise<StudyNote | undefined> => {
		if (notes.loading()) return undefined;
		if (!(await notes.flushSave())) return undefined;
		return new Promise((resolve) => {
			resolveCreateNote = resolve;
			setRenameTargetId(undefined);
			setNameDialogTitle("");
			setNameDialogError(undefined);
			setNameDialog("create");
		});
	};

	const requestRenameNote = async (note: StudyNote): Promise<void> => {
		if (!(await notes.flushSave())) return;
		const current = notes.notes().find((item) => item.id === note.id);
		if (!current) return;
		setRenameTargetId(current.id);
		setNameDialogTitle(current.title);
		setNameDialogError(undefined);
		setNameDialog("rename");
	};

	const closeNameDialog = (): void => {
		if (savingName()) return;
		const currentMode = nameDialog();
		setNameDialog(undefined);
		setRenameTargetId(undefined);
		setNameDialogError(undefined);
		if (currentMode === "create") {
			resolveCreateNote?.(undefined);
			resolveCreateNote = undefined;
		}
	};

	const confirmNameDialog = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		const currentMode = nameDialog();
		const title = nameDialogTitle().trim();
		if (!currentMode || !title || savingName()) return;
		const targetId = currentMode === "rename" ? renameTargetId() : undefined;
		if (!isNoteTitleAvailable(notes.notes(), title, targetId)) {
			setNameDialogError(t("duplicateNoteTitle"));
			return;
		}

		setSavingName(true);
		try {
			if (currentMode === "create") {
				const note = await notes.create(title);
				playSound("note-create");
				setNameDialog(undefined);
				resolveCreateNote?.(note);
				resolveCreateNote = undefined;
			} else {
				const note = notes.notes().find((item) => item.id === targetId);
				if (note && !(await notes.rename(note, title))) return;
				setNameDialog(undefined);
				setRenameTargetId(undefined);
				setNameDialogError(undefined);
			}
		} catch (error) {
			console.error(error);
			const code = typeof error === "string" ? error : error instanceof Error ? error.message : "";
			setNameDialogError(
				t(
					code === "DUPLICATE_TITLE"
						? "duplicateNoteTitle"
						: code.startsWith("RENAME_ROLLBACK_FAILED:")
							? "renameRecoveryFailed"
							: "renameFailed",
				),
			);
		} finally {
			setSavingName(false);
		}
	};

	const applyLocation = (location: NavigationLocation): void => {
		if (location.route === "note") {
			setSelectedId(location.noteId);
			const vaultId = dependencies.activeVaultId();
			if (vaultId) lastNotes.set(vaultId, location.noteId);
		}
		setRoute(location.route);
	};
	const navigate = async (location: NavigationLocation, targetIndex?: number): Promise<void> => {
		const vaultId = dependencies.activeVaultId();
		if (!vaultId || navigating() || notes.loading() || nameDialog()) return;
		setNavigating(true);
		try {
			if (!(await notes.flushSave()) || disposed || vaultId !== dependencies.activeVaultId()) return;
			if (location.route === "note" && !noteIds().has(location.noteId)) return;
			batch(() => {
				storeHistory(targetIndex === undefined ? recordNavigation(history(), location) : { ...history(), index: targetIndex });
				applyLocation(location);
			});
		} finally { if (!disposed) setNavigating(false); }
	};
	const travel = async (direction: -1 | 1): Promise<void> => {
		const index = findHistoryIndex(history(), direction, noteIds());
		if (index >= 0) await navigate(history().entries[index], index);
	};
	const openNote = (note: StudyNote): Promise<void> => navigate({ route: "note", noteId: note.id });

	const selectSearchResult = (note: StudyNote) => void openNote(note);
	const backToCanvas = (): Promise<void> => navigate({ route: "canvas" });
	const backToLastNote = (): Promise<void> => {
		const lastNote = selectedNote();
		return lastNote ? openNote(lastNote) : Promise.resolve();
	};

	const updateTitle = async (title: string): Promise<boolean> => {
		const current = selectedNote();
		if (!current) return false;
		return notes.rename(current, title);
	};

	const updateDocument = (document: NoteDocument): void => {
		const current = selectedNote();
		if (!current) return;
		notes.updateDocument(current.id, document);
	};

	const handleEscape = (): void => {
		if (nameDialog()) closeNameDialog();
		else if (route() === "note") void backToCanvas();
	};

	const canvasCenterOnMount = createMemo(() => dependencies.centerCanvasOnLaunch() && !centeredAtLaunch());

	return {
		route,
		mode,
		setMode,
		selectedNote,
		setCenteredAtLaunch,
		canvasCenterOnMount,
		nameDialog,
		nameDialogTitle,
		setNameDialogTitle: (title: string) => {
			setNameDialogTitle(title);
			setNameDialogError(undefined);
		},
		nameDialogError,
		savingName,
		createNoteAtCanvas,
		requestRenameNote,
		closeNameDialog,
		confirmNameDialog,
		openNote,
		selectSearchResult,
		backToCanvas,
		backToLastNote,
		navigating,
		canGoBack: () => !navigating() && !notes.loading() && findHistoryIndex(history(), -1, noteIds()) >= 0,
		canGoForward: () => !navigating() && !notes.loading() && findHistoryIndex(history(), 1, noteIds()) >= 0,
		goBack: () => travel(-1),
		goForward: () => travel(1),
		updateTitle,
		updateDocument,
		handleEscape,
		resetToCanvas: () => batch(() => { storeHistory(recordNavigation(history(), { route: "canvas" })); setRoute("canvas"); }),
	};
};

