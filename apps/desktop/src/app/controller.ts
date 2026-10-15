import { useCreateNoteFromLink } from "@/features/create-note-from-link";
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
	const beforeShutdown = async () => {
		if (saveNoteTitle && !(await saveNoteTitle())) return false;
		if (!(await notes.flushSave())) return false;
		return saveAiChats ? saveAiChats() : true;
	};
	const windowControls = useWindowControls(beforeShutdown, t);
	const aiChat = useAiChat({ provider: defaultAiProvider, enabled: preferences.aiFeaturesEnabled, vaultId: vaults.activeVaultId,
		notes: notes.notes, notesReady: () => !notes.loading() && notes.hasLoadedVault(), beforeSend: beforeShutdown, t });
	saveAiChats = aiChat.flushSave;
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const [vaultActionPending, setVaultActionPending] = createSignal(false);
	const navigation = useNoteNavigationController({
		notes,
		activeVaultId: vaults.activeVaultId,
		centerCanvasOnLaunch: preferences.centerCanvasOnLaunch,
		beforeNavigate: async () => saveNoteTitle ? saveNoteTitle() : true,
		t,
	});
	const canvasHistory = useCanvasHistory({
		vaultId: vaults.activeVaultId,
		notes,
		setLayout: preferences.setCanvasLayout,
		enabled: () => navigation.route() === "canvas" && navigation.mode() === "edit" &&
			!notes.loading() && !navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() &&
			!aiChat.open() && !vaultActionPending() && !updates.installing() && !notes.loadIssues().length,
	});
	const noteReferences = useCreateNoteFromLink({
		notes, vaultId: vaults.activeVaultId, sourceNoteId: () => navigation.selectedNote()?.id,
		enabled: () => !notes.loading() && !vaultActionPending() && !canvasHistory.pending() &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !updates.installing(),
		beforeOpen: beforeShutdown, onOpenNote: navigation.openNote,
	});
	const updates = useUpdatesController(beforeShutdown, () =>
		!navigation.nameDialog() && !navigation.navigating() && !vaults.dialogOpen() && !vaults.saving() && !vaultActionPending() && !canvasHistory.pending() && !noteReferences.pending(),
	);
	const temporaryReading = useTemporaryNoteReading({
		mode: navigation.mode,
		noteId: () => navigation.selectedNote()?.id,
		enabled: () => navigation.route() === "note" && Boolean(navigation.selectedNote()) &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() && !updates.installing(),
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
				navigation.nameDialog() || vaults.dialogOpen() || settingsOpen() || updates.installing()) return;
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
			if (!(await notes.flushSave())) return;
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
			return await vaults.create(name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const renameVault = async (vault: Vault, name: string): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await notes.flushSave())) return false;
			return await vaults.rename(vault, name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const deleteVault = async (vault: Vault): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await notes.flushSave())) return false;
			return await vaults.remove(vault);
		} finally {
			setVaultActionPending(false);
		}
	};
	return {
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
