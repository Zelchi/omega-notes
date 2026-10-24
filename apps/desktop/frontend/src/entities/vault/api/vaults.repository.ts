import { isDesktopRuntime } from "@/shared/lib/desktop";
import * as browserVaultsRepository from "./browser-vaults.repository";
import * as desktopVaultsRepository from "./desktop-vaults.repository";
import type { VaultDeleteResult, VaultDetails, VaultLibrary } from "../model/vault";

export const listVaults = (): Promise<VaultLibrary> =>
	isDesktopRuntime() ? desktopVaultsRepository.listVaults() : browserVaultsRepository.listVaults();

export const getVaultDetails = (vaultId: string): Promise<VaultDetails> =>
	isDesktopRuntime()
		? desktopVaultsRepository.getVaultDetails(vaultId)
		: browserVaultsRepository.getVaultDetails(vaultId);

export const createVault = (name: string): Promise<VaultLibrary> =>
	isDesktopRuntime() ? desktopVaultsRepository.createVault(name) : browserVaultsRepository.createVault(name);

export const switchVault = (vaultId: string): Promise<VaultLibrary> =>
	isDesktopRuntime() ? desktopVaultsRepository.switchVault(vaultId) : browserVaultsRepository.switchVault(vaultId);

export const renameVault = (vaultId: string, name: string): Promise<VaultLibrary> =>
	isDesktopRuntime()
		? desktopVaultsRepository.renameVault(vaultId, name)
		: browserVaultsRepository.renameVault(vaultId, name);

export const deleteVault = (vaultId: string): Promise<VaultDeleteResult> =>
	isDesktopRuntime() ? desktopVaultsRepository.deleteVault(vaultId) : browserVaultsRepository.deleteVault(vaultId);

export const reorderVaults = (vaultIds: string[]): Promise<VaultLibrary> =>
	isDesktopRuntime() ? desktopVaultsRepository.reorderVaults(vaultIds) : browserVaultsRepository.reorderVaults(vaultIds);
