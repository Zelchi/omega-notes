import { useNotes } from "@/entities/note";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { translate, type TranslationKey } from "@/shared/lib/i18n";
import { useVaults } from "@/features/manage-vault";
import type { Vault } from "@/entities/vault";
import { usePreferences } from "@/features/change-preferences";
import { useWindowControls } from "./model/window-controls.controller";
import { useNoteNavigationController } from "./model/note-navigation.controller";
import { useUpdatesController } from "@/features/check-for-updates";

export const useAppController = () => {
	const vaults = useVaults();
	const notes = useNotes(vaults.activeVaultId);
	const preferences = usePreferences();
	const t = (key: TranslationKey) => translate(preferences.language(), key);
	let saveNoteTitle: (() => Promise<boolean>) | undefined;
	const beforeShutdown = async () => {
		if (saveNoteTitle && !(await saveNoteTitle())) return false;
		return notes.flushSave();
	};
	const windowControls = useWindowControls(beforeShutdown, t);
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

	onMount(() => {
		const onShortcut = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (vaults.dialogOpen()) {
				if (!vaultActionPending() && !vaults.saving()) vaults.closeDialog();
			} else if (settingsOpen()) {
				setSettingsOpen(false);
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
		updates,
		registerBeforeShutdown: (save?: () => Promise<boolean>) => { saveNoteTitle = save; },
		vaults,
		notes,
		preferences,
		windowControls,
		navigation,
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
