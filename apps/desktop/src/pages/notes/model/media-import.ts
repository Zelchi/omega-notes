import { createImageObjectUrl } from "@/shared/lib/images";
import type { ImportedMedia } from "./media";
import {
	getNoteMediaStreamUrl,
	importNoteImage,
	importNoteMedia,
	readNoteImage,
	selectMediaPaths,
} from "../api/media.repository";

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
const audioExtensions = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);
const videoExtensions = new Set(["mp4", "ogv", "webm"]);

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

export const attachMediaFiles = async (files: File[]): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const file of files) {
		const extension = extensionFromFileName(file.name);
		const type = mediaTypeFromExtension(extension);
		if (!type) continue;
		try {
			const dataUrl = await readAsDataUrl(file);
			if (type === "image") media.push({ type, dataUrl });
			else if (type === "audio") media.push({ type, dataUrl, extension });
			else media.push({ type, dataUrl, extension });
		} catch (error) {
			console.error(error);
		}
	}
	return media;
};

export const importMediaPaths = async (paths: string[]): Promise<ImportedMedia[]> => {
	const media: ImportedMedia[] = [];
	for (const sourcePath of paths) {
		try {
			const extension = extensionFromFileName(sourcePath);
			const type = mediaTypeFromExtension(extension);
			if (!type) throw new Error("Unsupported media format");
			if (type === "image") {
				const imageId = await importNoteImage(sourcePath);
				media.push({ type, imageId });
				continue;
			}
			const mediaId = await importNoteMedia(sourcePath, type);
			media.push(type === "audio" ? { type, audioId: mediaId, extension } : { type, videoId: mediaId, extension });
		} catch (error) {
			console.error(error);
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

export const readMediaSource = async (mediaId: string, mediaType: "audio" | "video"): Promise<string> => {
	return getNoteMediaStreamUrl(mediaId, mediaType);
};
