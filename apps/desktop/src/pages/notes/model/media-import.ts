import { createImageObjectUrl } from "@/shared/lib/images";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { ImportedMedia } from "./media";
import {
	importNoteImage,
	importClipboardImage,
	readNoteImage,
	selectMediaPaths,
} from "../api/media.repository";

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
const clipboardImageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

const extensionFromFileName = (fileName: string): string => fileName.split(".").pop()?.toLowerCase() ?? "";

const readAsDataUrl = async (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid file"));
		reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
		reader.readAsDataURL(file);
	});
};

export const attachMediaFiles = async (files: File[], canImport: () => boolean = () => true): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const file of files) {
		if (!canImport()) return [];
		if (!imageExtensions.has(extensionFromFileName(file.name))) continue;
		try {
			const dataUrl = await readAsDataUrl(file);
			media.push({ type: "image", dataUrl });
		} catch (error) {
			console.error(error);
		}
	}
	return media;
};

export const importClipboardImages = async (files: File[], canImport: () => boolean): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const file of files) {
		if (!canImport()) return [];
		if (!clipboardImageTypes.has(file.type.toLowerCase())) continue;
		if (isTauriRuntime()) {
			const bytes = await file.arrayBuffer();
			if (!canImport()) return [];
			const imageId = await importClipboardImage(bytes);
			media.push({ type: "image", imageId });
		} else {
			media.push({ type: "image", dataUrl: await readAsDataUrl(file) });
		}
	}
	return media;
};

export const importMediaPaths = async (
	paths: string[],
	canImport: () => boolean = () => true,
	onError: () => void = () => {},
): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const sourcePath of paths) {
		if (!canImport()) return [];
		try {
			const extension = extensionFromFileName(sourcePath);
			if (!imageExtensions.has(extension)) throw new Error("Unsupported image format");
			const imageId = await importNoteImage(sourcePath);
			media.push({ type: "image", imageId });
		} catch (error) {
			console.error(error);
			onError();
		}
	}
	return media;
};

export const selectMediaFiles = (title: string): Promise<string[]> =>
	selectMediaPaths(title, [...imageExtensions]);

export const readImageSource = async (imageId: string): Promise<string> => {
	const data = await readNoteImage(imageId);
	return createImageObjectUrl(data);
};
