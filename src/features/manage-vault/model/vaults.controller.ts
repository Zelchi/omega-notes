import { createSignal, onMount } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { VaultErrorAction } from "./vault-error";
import {
	createVault,
	deleteVault,
	getVaultDetails,
	listVaults,
	renameVault,
	switchVault,
	type Vault,
} from "@/entities/vault";

const errorKeyFrom = (cause: unknown, fallback: TranslationKey): TranslationKey => {
	const message = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "";

	switch (message) {
		case "DUPLICATE_VAULT_NAME":
			return "duplicateVaultName";
		case "VAULT_NAME_TOO_LONG":
			return "vaultNameTooLong";
		default:
			return fallback;
	}
};

export const useVaults = () => {
	const [vaults, setVaults] = createSignal<Vault[]>([]);
	const [activeVaultId, setActiveVaultId] = createSignal<string>();
	const [dialogOpen, setDialogOpen] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<TranslationKey | undefined>(undefined, { equals: false });
	const [errorAction, setErrorAction] = createSignal<VaultErrorAction>();

	const clearError = (): void => {
		setError(undefined);
		setErrorAction(undefined);
	};

	const reportError = (key: TranslationKey, action: VaultErrorAction): void => {
		setError(key);
		setErrorAction(action);
	};

	const load = async (): Promise<void> => {
		try {
			const library = await listVaults();
			setVaults(library.vaults);
			setActiveVaultId(library.activeVaultId ?? undefined);
			setDialogOpen(!library.activeVaultId);
		} catch (cause) {
			console.error(cause);
			reportError("vaultLoadFailed", "load");
			setDialogOpen(true);
		}
	};

	onMount(() => void load());

	const retryLoad = async (): Promise<void> => {
		if (saving()) return;
		setSaving(true);
		clearError();
		try {
			await load();
		} finally {
			setSaving(false);
		}
	};

	const create = async (name: string): Promise<boolean> => {
		if (saving()) return false;
		setSaving(true);
		clearError();
		try {
			const library = await createVault(name);
			setVaults(library.vaults);
			setActiveVaultId(library.activeVaultId ?? undefined);
			return true;
		} catch (cause) {
			reportError(errorKeyFrom(cause, "vaultCreateFailed"), "create");
			return false;
		} finally {
			setSaving(false);
		}
	};

	const rename = async (vault: Vault, name: string): Promise<boolean> => {
		if (saving()) return false;
		setSaving(true);
		clearError();
		try {
			const library = await renameVault(vault.id, name);
			setVaults(library.vaults);
			return true;
		} catch (cause) {
			reportError(errorKeyFrom(cause, "vaultRenameFailed"), "rename");
			return false;
		} finally {
			setSaving(false);
		}
	};

	const remove = async (vault: Vault): Promise<boolean> => {
		if (saving()) return false;
		setSaving(true);
		clearError();
		try {
			const result = await deleteVault(vault.id);
			setVaults(result.library.vaults);
			setActiveVaultId(result.library.activeVaultId ?? undefined);
			if (!result.library.activeVaultId) setDialogOpen(true);
			if (result.cleanupError) reportError("vaultDeleteCleanupFailed", "notice");
			return true;
		} catch (cause) {
			console.error(cause);
			reportError(errorKeyFrom(cause, "vaultDeleteFailed"), "delete");
			return false;
		} finally {
			setSaving(false);
		}
	};

	const select = async (vault: Vault): Promise<void> => {
		if (saving()) return;
		if (vault.id === activeVaultId()) {
			clearError();
			setDialogOpen(false);
			return;
		}

		setSaving(true);
		clearError();
		try {
			const library = await switchVault(vault.id);
			setVaults(library.vaults);
			setActiveVaultId(library.activeVaultId ?? undefined);
			setDialogOpen(false);
		} catch (cause) {
			console.error(cause);
			reportError(errorKeyFrom(cause, "vaultOpenFailed"), "select");
		} finally {
			setSaving(false);
		}
	};

	return {
		vaults,
		activeVault: () => vaults().find((vault) => vault.id === activeVaultId()),
		activeVaultId,
		getDetails: getVaultDetails,
		dialogOpen,
		saving,
		error,
		errorAction,
		openDialog: () => {
			clearError();
			setDialogOpen(true);
		},
		retryLoad,
		clearError,
		closeDialog: () => {
			if (activeVaultId() && !saving()) {
				clearError();
				setDialogOpen(false);
			}
		},
		create,
		rename,
		remove,
		select,
	};
};
