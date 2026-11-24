import type { Vault } from "@/entities/vault";

export const filterVaultsByName = (vaults: readonly Vault[], query: string): Vault[] => {
	const search = query.trim().toLocaleLowerCase();
	return vaults.filter(vault => vault.name.toLocaleLowerCase().includes(search));
};

export const getVaultPageCount = (itemCount: number, pageSize: number): number =>
	Math.max(1, Math.ceil(Math.max(0, itemCount) / Math.max(1, Math.floor(pageSize))));

export const getVaultPageItems = <T,>(items: readonly T[], page: number, pageSize: number): T[] => {
	const size = Math.max(1, Math.floor(pageSize));
	const start = Math.max(0, Math.floor(page)) * size;
	return items.slice(start, start + size);
};

export const clampVaultPage = (page: number, pageCount: number): number =>
	Math.max(0, Math.min(Math.floor(page), Math.max(0, Math.floor(pageCount) - 1)));

export const getVaultPageForSelection = (vaults: readonly Vault[], selectedId: string | undefined, pageSize: number): number => {
	const index = vaults.findIndex(vault => vault.id === selectedId);
	return index < 0 ? 0 : Math.floor(index / Math.max(1, Math.floor(pageSize)));
};

export const parseVaultPageInput = (value: string, pageCount: number): number | undefined => {
	const target = Number(value);
	return Number.isInteger(target) && target >= 1 && target <= pageCount ? target - 1 : undefined;
};
