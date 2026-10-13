import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import { isNoteTitleAvailable, type NotesLibrary, type NoteDocument, type StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";

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

	createEffect(() => {
		dependencies.activeVaultId();
		setSelectedId(undefined);
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

	const openNote = async (note: StudyNote): Promise<void> => {
		if (!(await notes.flushSave())) return;
		setSelectedId(note.id);
		setRoute("note");
	};

	const selectSearchResult = (note: StudyNote) => void openNote(note);
	const backToCanvas = async () => {
		if (!(await notes.flushSave())) return;
		setRoute("canvas");
	};
	const backToLastNote = async () => {
		const lastNote = selectedNote();
		if (!lastNote) return;
		if (!(await notes.flushSave())) return;
		setRoute("note");
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
		updateTitle,
		updateDocument,
		handleEscape,
		resetToCanvas: () => setRoute("canvas"),
	};
};

