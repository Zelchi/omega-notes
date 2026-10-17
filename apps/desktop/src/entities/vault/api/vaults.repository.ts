import { isTauriRuntime } from "@/shared/lib/tauri";
import * as browserVaultsRepository from "./browser-vaults.repository";
import * as tauriVaultsRepository from "./tauri-vaults.repository";
import type { VaultDeleteResult, VaultDetails, VaultLibrary } from "../model/vault";

export const listVaults = (): Promise<VaultLibrary> =>
	isTauriRuntime() ? tauriVaultsRepository.listVaults() : browserVaultsRepository.listVaults();

export const getVaultDetails = (vaultId: string): Promise<VaultDetails> =>
	isTauriRuntime()
		? tauriVaultsRepository.getVaultDetails(vaultId)
		: browserVaultsRepository.getVaultDetails(vaultId);

export const createVault = (name: string): Promise<VaultLibrary> =>
	isTauriRuntime() ? tauriVaultsRepository.createVault(name) : browserVaultsRepository.createVault(name);

export const switchVault = (vaultId: string): Promise<VaultLibrary> =>
	isTauriRuntime() ? tauriVaultsRepository.switchVault(vaultId) : browserVaultsRepository.switchVault(vaultId);

export const renameVault = (vaultId: string, name: string): Promise<VaultLibrary> =>
	isTauriRuntime()
		? tauriVaultsRepository.renameVault(vaultId, name)
		: browserVaultsRepository.renameVault(vaultId, name);

export const deleteVault = (vaultId: string): Promise<VaultDeleteResult> =>
	isTauriRuntime() ? tauriVaultsRepository.deleteVault(vaultId) : browserVaultsRepository.deleteVault(vaultId);

export const reorderVaults = (vaultIds: string[]): Promise<VaultLibrary> =>
	isTauriRuntime() ? tauriVaultsRepository.reorderVaults(vaultIds) : browserVaultsRepository.reorderVaults(vaultIds);
