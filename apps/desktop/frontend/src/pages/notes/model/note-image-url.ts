import { isTauriRuntime } from "../../../shared/lib/desktop";

type ImageUrlRuntime = "electron" | "tauri";

export const resolveNoteImageSource = (
	key: string,
	vaultId: string,
	desktop: boolean,
	runtime?: ImageUrlRuntime,
): string => {
	if (key.startsWith("data:")) return key;
	if (!key || !desktop || !vaultId) return "";
	return noteImageUrl(vaultId, key, runtime);
};

export const noteImageUrl = (
	vaultId: string,
	imageId: string,
	runtime: ImageUrlRuntime = isTauriRuntime() ? "tauri" : "electron",
): string => {
	const encodedVaultId = encodeURIComponent(vaultId);
	const encodedImageId = encodeURIComponent(imageId);
	return runtime === "tauri"
		? `http://omega-image.localhost/${encodedVaultId}/${encodedImageId}`
		: `omega-image://${encodedVaultId}/${encodedImageId}`;
};
