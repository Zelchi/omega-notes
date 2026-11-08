import { isTauriRuntime } from "../../../shared/lib/desktop";

type ImageUrlRuntime = "electron" | "tauri";

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
