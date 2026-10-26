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

const waitForVideoEvent = (
	video: HTMLVideoElement,
	eventName: "loadedmetadata" | "loadeddata" | "seeked",
	signal: AbortSignal,
	readyState = 0,
	start?: () => void,
): Promise<void> => new Promise((resolve, reject) => {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const finish = (error?: Error): void => {
		if (timeout) clearTimeout(timeout);
		video.removeEventListener(eventName, loaded);
		video.removeEventListener("error", failed);
		signal.removeEventListener("abort", aborted);
		if (error) reject(error);
		else resolve();
	};
	const loaded = (): void => finish();
	const failed = (): void => finish(new Error("Could not decode video thumbnail"));
	const aborted = (): void => finish(new Error("Video thumbnail loading was cancelled"));
	video.addEventListener(eventName, loaded);
	video.addEventListener("error", failed);
	signal.addEventListener("abort", aborted, { once: true });
	timeout = setTimeout(() => finish(new Error("Timed out loading video thumbnail")), 15_000);
	if (signal.aborted) aborted();
	else if (readyState && video.readyState >= readyState) finish();
	else {
		try {
			start?.();
		} catch (error) {
			finish(error instanceof Error ? error : new Error(String(error)));
		}
	}
});

export const readVideoThumbnailSource = async (
	source: Extract<ImportedMedia, { type: "video" }>,
	signal: AbortSignal,
): Promise<string> => {
	const stored = "videoId" in source;
	const mediaUrl = stored ? await readMediaSource(source.videoId, "video") : source.dataUrl;
	if (signal.aborted) throw new Error("Video thumbnail loading was cancelled");

	const video = document.createElement("video");
	video.preload = "metadata";
	video.muted = true;
	video.playsInline = true;
	if (stored) video.crossOrigin = "anonymous";

	try {
		await waitForVideoEvent(video, "loadedmetadata", signal, 1, () => {
			video.src = mediaUrl;
			video.load();
		});
		if (Number.isFinite(video.duration) && video.duration > 0) {
			await waitForVideoEvent(video, "seeked", signal, 0, () => { video.currentTime = video.duration / 2; });
		}
		if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata", signal, 2);

		if (!video.videoWidth || !video.videoHeight) throw new Error("Video has no preview frame");
		const scale = Math.min(1, 320 / video.videoWidth, 240 / video.videoHeight);
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
		canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not create video thumbnail canvas");
		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode video thumbnail")), "image/jpeg", 0.82);
		});
		return URL.createObjectURL(blob);
	} finally {
		video.pause();
		video.removeAttribute("src");
		video.load();
	}
};
