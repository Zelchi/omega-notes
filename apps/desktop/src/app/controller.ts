import { useNotes, type StudyNote } from "@/entities/note";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { translate, type TranslationKey } from "@/shared/lib/i18n";
import { useVaults } from "@/features/manage-vault";
import type { Vault } from "@/entities/vault";
import { usePreferences } from "@/features/change-preferences";
import { useWindowControls } from "./model/window-controls.controller";
import { useNoteNavigationController } from "./model/note-navigation.controller";
import { useUpdatesController } from "@/features/check-for-updates";
import { useAiChat, defaultAiProvider } from "@/features/chat-with-ai";
import { useTemporaryNoteReading } from "@/features/follow-note-link";

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
	const aiChat = useAiChat({ provider: defaultAiProvider, enabled: preferences.aiFeaturesEnabled, vaultId: vaults.activeVaultId, beforeSend: beforeShutdown, t });
	saveAiChats = aiChat.flushSave;
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const [vaultActionPending, setVaultActionPending] = createSignal(false);
	const navigation = useNoteNavigationController({
		notes,
		activeVaultId: vaults.activeVaultId,
		centerCanvasOnLaunch: preferences.centerCanvasOnLaunch,
		t,
	});
	const updates = useUpdatesController(beforeShutdown, () =>
		!navigation.nameDialog() && !vaults.dialogOpen() && !vaults.saving() && !vaultActionPending(),
	);
	const temporaryReading = useTemporaryNoteReading({
		mode: navigation.mode,
		noteId: () => navigation.selectedNote()?.id,
		enabled: () => navigation.route() === "note" && Boolean(navigation.selectedNote()) &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() && !updates.installing(),
	});

	onMount(() => {
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
		if (vaultActionPending()) return;
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
		if (vaultActionPending()) return false;
		setVaultActionPending(true);
		try {
			return await vaults.create(name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const renameVault = async (vault: Vault, name: string): Promise<boolean> => {
		if (vaultActionPending()) return false;
		setVaultActionPending(true);
		try {
			if (!(await notes.flushSave())) return false;
			return await vaults.rename(vault, name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const deleteVault = async (vault: Vault): Promise<boolean> => {
		if (vaultActionPending()) return false;
		setVaultActionPending(true);
		try {
			if (!(await notes.flushSave())) return false;
			return await vaults.remove(vault);
		} finally {
			setVaultActionPending(false);
		}
	};
	return {
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
