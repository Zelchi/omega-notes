import { invoke } from "@tauri-apps/api/core";
import type { VaultDeleteResult, VaultDetails, VaultLibrary } from "../model/vault";

export const listVaults = (): Promise<VaultLibrary> => invoke<VaultLibrary>("list_vaults");

export const getVaultDetails = (vaultId: string): Promise<VaultDetails> =>
	invoke<VaultDetails>("get_vault_details", { vaultId });

export const createVault = (name: string): Promise<VaultLibrary> => invoke<VaultLibrary>("create_vault", { name });

export const switchVault = (vaultId: string): Promise<VaultLibrary> =>
	invoke<VaultLibrary>("switch_vault", { vaultId });

export const renameVault = (vaultId: string, name: string): Promise<VaultLibrary> =>
	invoke<VaultLibrary>("rename_vault", { vaultId, vaultName: name });

export const deleteVault = (vaultId: string): Promise<VaultDeleteResult> =>
	invoke<VaultDeleteResult>("delete_vault", { vaultId });
