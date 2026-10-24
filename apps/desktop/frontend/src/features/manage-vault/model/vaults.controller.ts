import { createEffect, createSignal, on, onMount, type Accessor, type Setter } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { VaultErrorAction } from "./vault-error";
import type { VaultDetails } from "@/entities/vault";
import {
	createVault,
	deleteVault,
	getVaultDetails,
	listVaults,
	renameVault,
	reorderVaults,
	switchVault,
	type Vault,
} from "@/entities/vault";

export type VaultDialogState = {
	name: Accessor<string>; setName: Setter<string>;
	editingVaultId: Accessor<string | undefined>; setEditingVaultId: Setter<string | undefined>;
	editingName: Accessor<string>; setEditingName: Setter<string>;
	deletingVault: Accessor<Vault | undefined>; setDeletingVault: Setter<Vault | undefined>;
	deleteConfirmationVisible: Accessor<boolean>; setDeleteConfirmationVisible: Setter<boolean>;
	selectedVaultId: Accessor<string | undefined>; setSelectedVaultId: Setter<string | undefined>;
	details: Accessor<Record<string, VaultDetails>>; setDetails: Setter<Record<string, VaultDetails>>;
};

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
	const [name, setName] = createSignal("");
	const [editingVaultId, setEditingVaultId] = createSignal<string>();
	const [editingName, setEditingName] = createSignal("");
	const [deletingVault, setDeletingVault] = createSignal<Vault>();
	const [deleteConfirmationVisible, setDeleteConfirmationVisible] = createSignal(false);
	const [selectedVaultId, setSelectedVaultId] = createSignal<string>();
	const [details, setDetails] = createSignal<Record<string, VaultDetails>>({});
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<TranslationKey | undefined>(undefined, { equals: false });
	const [errorAction, setErrorAction] = createSignal<VaultErrorAction>();
	const pendingDetails = new Map<string, Promise<VaultDetails>>();
	const resetDialogDrafts = () => { setName(""); setEditingVaultId(undefined); setEditingName(""); setDeletingVault(undefined); setDeleteConfirmationVisible(false); };
	const dialogState: VaultDialogState = {
		name, setName, editingVaultId, setEditingVaultId, editingName, setEditingName,
		deletingVault, setDeletingVault, selectedVaultId, setSelectedVaultId, details, setDetails,
		deleteConfirmationVisible, setDeleteConfirmationVisible,
	};

	const clearError = (): void => {
		setError(undefined);
		setErrorAction(undefined);
	};

	const reportError = (key: TranslationKey, action: VaultErrorAction): void => {
		setError(key);
		setErrorAction(action);
	};

	createEffect(() => {
		if (!dialogOpen()) return;
		const list = vaults(), selected = selectedVaultId();
		if (!selected || !list.some(vault => vault.id === selected)) setSelectedVaultId(activeVaultId() ?? list[0]?.id);
	});
	createEffect(on(activeVaultId, (id, previous) => {
		if (previous !== undefined && id !== previous) resetDialogDrafts();
	}));

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
	const loadDetails = (vaultId: string): Promise<VaultDetails> => {
		const pending = pendingDetails.get(vaultId);
		if (pending) return pending;
		const request = getVaultDetails(vaultId).then(value => {
			setDetails(previous => ({ ...previous, [vaultId]: value }));
			return value;
		}).finally(() => { if (pendingDetails.get(vaultId) === request) pendingDetails.delete(vaultId); });
		pendingDetails.set(vaultId, request);
		return request;
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
			setName("");
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
			setEditingVaultId(undefined);
			setEditingName("");
			return true;
		} catch (cause) {
			reportError(errorKeyFrom(cause, "vaultRenameFailed"), "rename");
			return false;
		} finally {
			setSaving(false);
		}
	};

	const reorder = async (vaultIds: string[]): Promise<boolean> => {
		if (saving()) return false;
		setSaving(true);
		clearError();
		try {
			const library = await reorderVaults(vaultIds);
			setVaults(library.vaults);
			return true;
		} catch (cause) {
			console.error(cause);
			reportError("vaultReorderFailed", "notice");
			return false;
		} finally { setSaving(false); }
	};

	const remove = async (vault: Vault): Promise<boolean> => {
		if (saving()) return false;
		setSaving(true);
		clearError();
		try {
			const result = await deleteVault(vault.id);
			setVaults(result.library.vaults);
			setActiveVaultId(result.library.activeVaultId ?? undefined);
			setDeletingVault(undefined);
			setDeleteConfirmationVisible(false);
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
			resetDialogDrafts();
			setDialogOpen(false);
			return;
		}

		setSaving(true);
		clearError();
		try {
			const library = await switchVault(vault.id);
			setVaults(library.vaults);
			setActiveVaultId(library.activeVaultId ?? undefined);
			resetDialogDrafts();
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
		getDetails: loadDetails,
		dialogState,
		dialogOpen,
		saving,
		error,
		errorAction,
		openDialog: () => {
			const list = vaults();
			if (!selectedVaultId() || !list.some(vault => vault.id === selectedVaultId())) setSelectedVaultId(activeVaultId() ?? list[0]?.id);
			setDialogOpen(true);
		},
		retryLoad,
		clearError,
		closeDialog: () => { if (activeVaultId()) setDialogOpen(false); },
		create,
		rename,
		remove,
		reorder,
		select,
	};
};
