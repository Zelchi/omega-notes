import { useCreateNoteFromLink } from "@/features/create-note-from-link";
import { useStudies } from "@/features/study-notes";
import type { StudyKind } from "@/entities/study";
import { useNoteDeletion } from "@/features/delete-note";
import { useCanvasHistory } from "@/features/undo-canvas-edit";
import { useNotes, type StudyNote } from "@/entities/note";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { translate, type TranslationKey } from "@/shared/lib/i18n";
import { useVaults } from "@/features/manage-vault";
import type { Vault } from "@/entities/vault";
import { matchesAiChatShortcut, usePreferences } from "@/features/change-preferences";
import { useWindowControls } from "./model/window-controls.controller";
import { useNoteNavigationController } from "./model/note-navigation.controller";
import { useUpdatesController } from "@/features/check-for-updates";
import { useAiChat, defaultAiProvider } from "@/features/chat-with-ai";
import { useTemporaryNoteReading } from "@/features/follow-note-link";
import { disposeSounds, prepareSounds } from "@/shared/ui/sound";

export const useAppController = () => {
	const vaults = useVaults();
	const notes = useNotes(vaults.activeVaultId);
	const preferences = usePreferences();
	const t = (key: TranslationKey) => translate(preferences.language(), key);
	let saveNoteTitle: (() => Promise<boolean>) | undefined;
	let saveAiChats: (() => Promise<boolean>) | undefined;
	let saveStudies: (() => Promise<boolean>) | undefined;
	const [vaultActionPending, setVaultActionPending] = createSignal(false);
	const beforeAiRequest = async () => {
		if (saveNoteTitle && !(await saveNoteTitle())) return false;
		if (!(await notes.flushSave())) return false;
		return saveAiChats ? saveAiChats() : true;
	};
	const beforeShutdown = async () => {
		if (!(await beforeAiRequest())) return false;
		return saveStudies ? saveStudies() : true;
	};
	const windowControls = useWindowControls(beforeShutdown, t);
	const navigation = useNoteNavigationController({
		notes,
		activeVaultId: vaults.activeVaultId,
		centerCanvasOnLaunch: preferences.centerCanvasOnLaunch,
		beforeNavigate: async () => saveNoteTitle ? saveNoteTitle() : true,
		t,
	});
	const aiChat = useAiChat({ provider: defaultAiProvider, enabled: preferences.aiFeaturesEnabled, vaultId: vaults.activeVaultId,
		notes: notes.notes, currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined, notesReady: () => !notes.loading() && notes.hasLoadedVault(), beforeSend: beforeAiRequest, applyLinkedMentions: notes.applyLinkedMentions, t });
	const canGenerateStudy = () => preferences.aiFeaturesEnabled() && aiChat.ready() && aiChat.status().connected && aiChat.status().authenticated &&
		!aiChat.pending() && !aiChat.sending() && !aiChat.chat().busy && !notes.loading() && !vaultActionPending();
	const studies = useStudies({
		vaultId: vaults.activeVaultId, notes: notes.notes,
		currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined,
		aiEnabled: preferences.aiFeaturesEnabled, canGenerate: canGenerateStudy,
		aiConnected: () => aiChat.status().connected && aiChat.status().authenticated,
		onConnect: () => aiChat.setOpen(true),
		requestText: aiChat.requestText,
		describeAiError: aiChat.describeError,
		onOpenNote: navigation.openNote, t,
	});
	saveAiChats = aiChat.flushSave;
	saveStudies = studies.flushSave;
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const canvasHistory = useCanvasHistory({
		vaultId: vaults.activeVaultId,
		notes,
		setLayout: preferences.setCanvasLayout,
		enabled: () => navigation.route() === "canvas" && navigation.mode() === "edit" &&
			!notes.loading() && !navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() &&
			!aiChat.open() && !noteDeletion.target() && !noteDeletion.pending() && !vaultActionPending() && !updates.installing() && !notes.loadIssues().length,
	});
	const noteDeletion = useNoteDeletion({
		vaultId: vaults.activeVaultId,
		notes: notes.notes,
		blocked: () => notes.loading() || canvasHistory.pending() || vaultActionPending() || navigation.navigating() || updates.installing(),
		beforeDelete: async () => {
			if (saveNoteTitle && !(await saveNoteTitle())) return false;
			return notes.flushSave();
		},
		remove: canvasHistory.remove,
		onDeleted: () => {
			if (navigation.route() === "note" && !navigation.selectedNote()) void navigation.backToCanvas();
		},
	});
	const noteReferences = useCreateNoteFromLink({
		notes, vaultId: vaults.activeVaultId, sourceNoteId: () => navigation.selectedNote()?.id,
		enabled: () => !notes.loading() && !vaultActionPending() && !canvasHistory.pending() &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !noteDeletion.target() && !noteDeletion.pending() && !updates.installing(),
		beforeOpen: beforeShutdown, onOpenNote: navigation.openNote,
	});
	const updates = useUpdatesController(beforeShutdown, () =>
		!studies.open() && !noteDeletion.target() && !noteDeletion.pending() && !navigation.nameDialog() && !navigation.navigating() && !vaults.dialogOpen() && !vaults.saving() && !vaultActionPending() && !canvasHistory.pending() && !noteReferences.pending(),
	);
	const temporaryReading = useTemporaryNoteReading({
		mode: navigation.mode,
		noteId: () => navigation.selectedNote()?.id,
		enabled: () => navigation.route() === "note" && Boolean(navigation.selectedNote()) &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() && !studies.open() && !updates.installing(),
	});


	const [studyReturn, setStudyReturn] = createSignal<{ vaultId: string; kind: StudyKind }>();
	let studyNavigationDisposed = false, studyNavigationRevision = 0;
	createEffect(() => {
		vaults.activeVaultId(); preferences.aiFeaturesEnabled();
		++studyNavigationRevision; setStudyReturn(undefined);
	});
	onCleanup(() => { studyNavigationDisposed = true; });
	const openStudyNote = async (note: StudyNote): Promise<void> => {
		const vaultId = vaults.activeVaultId(), kind = studies.kind(), revision = studyNavigationRevision;
		if (!vaultId || !preferences.aiFeaturesEnabled()) return;
		setStudyReturn(undefined); studies.close();
		try { await navigation.openNote(note); }
		catch { /* Failed navigation returns to the preserved study below. */ }
		if (studyNavigationDisposed || revision !== studyNavigationRevision || vaultId !== vaults.activeVaultId() ||
			!preferences.aiFeaturesEnabled() || studies.open()) return;
		if (navigation.route() === "note" && navigation.selectedNote()?.id === note.id) setStudyReturn({ vaultId, kind });
		else studies.show(kind);
	};
	createEffect(() => {
		const target = studyReturn(), vaultId = vaults.activeVaultId(), enabled = preferences.aiFeaturesEnabled();
		if (!target) return;
		if (!enabled || vaultId !== target.vaultId || studies.open()) { setStudyReturn(undefined); return; }
		if (navigation.route() !== "canvas" || navigation.navigating() || vaults.dialogOpen() || settingsOpen() ||
			navigation.nameDialog() || noteDeletion.target() || noteDeletion.pending() || updates.installing()) return;
		// Let the note/context close effects finish before reopening the preserved method.
		const frame = requestAnimationFrame(() => {
			if (studyNavigationDisposed || studyReturn() !== target || vaults.activeVaultId() !== target.vaultId ||
				!preferences.aiFeaturesEnabled() || navigation.route() !== "canvas") return;
			setStudyReturn(undefined); studies.show(target.kind);
		});
		onCleanup(() => cancelAnimationFrame(frame));
	});

	onMount(() => {
		prepareSounds();
		onCleanup(disposeSounds);
		const preventNativeTab = (event: KeyboardEvent) => {
			if (event.key === "Tab") event.preventDefault();
		};
		addEventListener("keydown", preventNativeTab, true);
		onCleanup(() => removeEventListener("keydown", preventNativeTab, true));

		const onAiShortcut = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || !preferences.aiFeaturesEnabled() || !vaults.activeVaultId() ||
				navigation.nameDialog() || vaults.dialogOpen() || settingsOpen() || studies.open() || noteDeletion.target() || noteDeletion.pending() || updates.installing()) return;
			if (!matchesAiChatShortcut(event, preferences.aiChatShortcut())) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) aiChat.setOpen((open) => !open);
		};
		addEventListener("keydown", onAiShortcut, true);
		onCleanup(() => removeEventListener("keydown", onAiShortcut, true));

		const onShortcut = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (vaults.dialogOpen()) {
				if (!vaultActionPending() && !vaults.saving()) vaults.closeDialog();
			} else if (settingsOpen()) {
				setSettingsOpen(false);
			} else if (aiChat.open()) {
				aiChat.setOpen(false);
			} else {
				navigation.handleEscape();
			}
		};
		addEventListener("keydown", onShortcut);
		onCleanup(() => removeEventListener("keydown", onShortcut));
	});

	createEffect(() => {
		document.documentElement.lang = t("locale");
		const appName = t("appName");
		const title = navigation.route() === "note" ? navigation.selectedNote()?.title : undefined;
		document.title = title ? `${title} · ${appName}` : appName;
	});

	const selectVault = async (vault: Vault): Promise<void> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return;
			const previousId = vaults.activeVaultId();
			await vaults.select(vault);
			if (previousId !== vaults.activeVaultId()) navigation.resetToCanvas();
		} finally {
			setVaultActionPending(false);
		}
	};
	const openAiNote = async (note: StudyNote): Promise<void> => {
		const vaultId = vaults.activeVaultId();
		if (!vaultId || !(await beforeShutdown()) || vaultId !== vaults.activeVaultId()) return;
		const current = notes.notes().find((item) => item.id === note.id);
		if (!current) return;
		await navigation.openNote(current);
	};
	const createVault = async (name: string): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.create(name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const renameVault = async (vault: Vault, name: string): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.rename(vault, name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const deleteVault = async (vault: Vault): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.remove(vault);
		} finally {
			setVaultActionPending(false);
		}
	};
	return {
		studies, canGenerateStudy, openStudyNote,
		noteDeletion,
		noteReferences,
		canvasHistory,
		aiChat,
		openAiNote,
		updates,
		registerBeforeShutdown: (save?: () => Promise<boolean>) => { saveNoteTitle = save; },
		vaults,
		notes,
		preferences,
		windowControls,
		navigation,
		temporaryReading,
		settingsOpen,
		setSettingsOpen,
		vaultActionPending,
		selectVault,
		createVault,
		renameVault,
		deleteVault,
		t,
	};
};
