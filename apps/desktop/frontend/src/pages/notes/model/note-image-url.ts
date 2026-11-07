export const noteImageUrl = (vaultId: string, imageId: string): string =>
	`omega-image://${encodeURIComponent(vaultId)}/${encodeURIComponent(imageId)}`;
