import { createImageObjectUrl } from "@/shared/lib/images";
import { isDesktopRuntime, pathForFile } from "@/shared/lib/desktop";
import type { ImportedMedia } from "./media";
import {
	getNoteMediaStreamUrl,
	importNoteImage,
	importNoteMedia,
	importClipboardImage,
	readNoteImage,
	selectMediaPaths,
} from "../api/media.repository";

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
const audioExtensions = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);
const videoExtensions = new Set(["mp4", "ogv", "webm"]);
const clipboardImageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

const mediaTypeFromExtension = (extension: string): "image" | "audio" | "video" | undefined => {
	if (imageExtensions.has(extension)) return "image";
	if (audioExtensions.has(extension)) return "audio";
	if (videoExtensions.has(extension)) return "video";
	return undefined;
};

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

const importPath = async (sourcePath: string, type: "image" | "audio" | "video", extension: string): Promise<ImportedMedia> => {
	if (type === "image") return { type, imageId: await importNoteImage(sourcePath) };
	const mediaId = await importNoteMedia(sourcePath, type);
	return type === "audio"
		? { type, audioId: mediaId, extension }
		: { type, videoId: mediaId, extension };
};

export const attachMediaFiles = async (
	files: File[],
	canImport: () => boolean = () => true,
	onError: () => void = () => {},
): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const file of files) {
		if (!canImport()) return [];
		const extension = extensionFromFileName(file.name);
		const type = mediaTypeFromExtension(extension);
		if (!type) continue;
		try {
			if (isDesktopRuntime()) {
				const sourcePath = await pathForFile(file);
				if (!sourcePath) throw new Error("Unable to resolve media file path");
				if (!canImport()) return [];
				media.push(await importPath(sourcePath, type, extension));
			} else {
				const dataUrl = await readAsDataUrl(file);
				if (type === "image") media.push({ type, dataUrl });
				else if (type === "audio") media.push({ type, dataUrl, extension });
				else media.push({ type, dataUrl, extension });
			}
		} catch (error) {
			console.error(error);
			onError();
		}
	}
	return media;
};

export const importClipboardImages = async (files: File[], canImport: () => boolean): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const file of files) {
		if (!canImport()) return [];
		if (!clipboardImageTypes.has(file.type.toLowerCase())) continue;
		if (isDesktopRuntime()) {
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
			const type = mediaTypeFromExtension(extension);
			if (!type) throw new Error("Unsupported media format");
			media.push(await importPath(sourcePath, type, extension));
		} catch (error) {
			console.error(error);
			onError();
		}
	}
	return media;
};

export const selectMediaFiles = (title: string): Promise<string[]> =>
	selectMediaPaths(title, [...imageExtensions, ...audioExtensions, ...videoExtensions]);

export const readImageSource = async (imageId: string): Promise<string> => {
	const data = await readNoteImage(imageId);
	return createImageObjectUrl(data);
};

export const readMediaSource = (mediaId: string, mediaType: "audio" | "video"): Promise<string> =>
	getNoteMediaStreamUrl(mediaId, mediaType);
