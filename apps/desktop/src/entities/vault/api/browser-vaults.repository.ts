import { deleteBrowserNotesForVault, getBrowserNotesStats } from "@/entities/note/@x/vault";
import { createUuidV7 } from "@/shared/lib/ids";
import type { Vault, VaultDeleteResult, VaultDetails, VaultLibrary } from "../model/vault";

const STORAGE_KEY = "omega-notes.vaults.v1";

const readBrowserLibrary = (): VaultLibrary => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return { vaults: [], activeVaultId: null };
		const library = JSON.parse(stored) as VaultLibrary;
		const activeVaultId = library.vaults.some((vault) => vault.id === library.activeVaultId)
			? library.activeVaultId
			: null;
		return { vaults: library.vaults, activeVaultId };
	} catch {
		return { vaults: [], activeVaultId: null };
	}
};

const writeBrowserLibrary = (library: VaultLibrary): void => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
};

const normalizeVaultName = (name: string): string =>
	name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase();

const vaultCreatedAt = (vaultId: string): number => {
	if (vaultId[14]?.toLowerCase() !== "7") return 0;
	const timestamp = Number.parseInt(vaultId.replaceAll("-", "").slice(0, 12), 16);
	return Number.isFinite(timestamp) ? timestamp : 0;
};

export const listVaults = async (): Promise<VaultLibrary> => readBrowserLibrary();

export const getVaultDetails = async (vaultId: string): Promise<VaultDetails> => {
	const createdAt = vaultCreatedAt(vaultId);
	return { ...getBrowserNotesStats(vaultId), createdAt };
};

export const createVault = async (name: string): Promise<VaultLibrary> => {
	const library = readBrowserLibrary();
	const trimmedName = name.trim();
	if (library.vaults.some((vault) => normalizeVaultName(vault.name) === normalizeVaultName(trimmedName))) {
		throw new Error("DUPLICATE_VAULT_NAME");
	}

	const vault: Vault = { id: createUuidV7(), name: trimmedName };
	const nextLibrary = { vaults: [...library.vaults, vault], activeVaultId: library.activeVaultId };
	writeBrowserLibrary(nextLibrary);
	return nextLibrary;
};

export const switchVault = async (vaultId: string): Promise<VaultLibrary> => {
	const library = readBrowserLibrary();
	if (!library.vaults.some((vault) => vault.id === vaultId)) throw new Error("VAULT_NOT_FOUND");
	const nextLibrary = { ...library, activeVaultId: vaultId };
	writeBrowserLibrary(nextLibrary);
	return nextLibrary;
};

export const renameVault = async (vaultId: string, name: string): Promise<VaultLibrary> => {
	const library = readBrowserLibrary();
	const trimmedName = name.trim();
	if (
		library.vaults.some(
			(vault) => vault.id !== vaultId && normalizeVaultName(vault.name) === normalizeVaultName(trimmedName),
		)
	) {
		throw new Error("DUPLICATE_VAULT_NAME");
	}
	const nextLibrary = {
		...library,
		vaults: library.vaults.map((vault) => (vault.id === vaultId ? { ...vault, name: trimmedName } : vault)),
	};
	writeBrowserLibrary(nextLibrary);
	return nextLibrary;
};

export const deleteVault = async (vaultId: string): Promise<VaultDeleteResult> => {
	const library = readBrowserLibrary();
	if (!library.vaults.some((vault) => vault.id === vaultId)) throw new Error("VAULT_NOT_FOUND");
	deleteBrowserNotesForVault(vaultId);
	const nextLibrary = {
		vaults: library.vaults.filter((vault) => vault.id !== vaultId),
		activeVaultId: library.activeVaultId === vaultId ? null : library.activeVaultId,
	};
	writeBrowserLibrary(nextLibrary);
	return { library: nextLibrary, cleanupError: null };
};
