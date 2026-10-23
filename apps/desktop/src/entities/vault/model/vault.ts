export type Vault = {
	id: string;
	name: string;
};

export type VaultLibrary = {
	vaults: Vault[];
	activeVaultId: string | null;
};

export type VaultDetails = {
	noteCount: number;
	imageCount: number;
	characterCount: number;
	createdAt: number;
	storageBytes: number;
	lastModifiedAt: number;
};

export type VaultDeleteResult = {
	library: VaultLibrary;
	cleanupError: string | null;
};

