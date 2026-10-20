import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

export type MediaCleanupSummary = { images: number; audio: number; video: number };

export type DroppedMediaFiles = {
	paths: string[];
	x: number;
	y: number;
};

export const onMediaFilesDropped = (handler: (drop: DroppedMediaFiles) => void): Promise<() => void> =>
	getCurrentWebview().onDragDropEvent((event) => {
		if (event.payload.type !== "drop") return;
		const position = event.payload.position.toLogical(devicePixelRatio || 1);
		handler({ paths: event.payload.paths, x: position.x, y: position.y });
	});

export const selectMediaPaths = async (title: string, extensions: string[]): Promise<string[]> => {
	const paths = await open({
		title,
		multiple: true,
		directory: false,
		filters: [{ name: title, extensions }],
	});
	return paths === null ? [] : typeof paths === "string" ? [paths] : paths;
};

export const importNoteImage = (sourcePath: string): Promise<string> =>
	invoke<string>("import_note_image", { sourcePath });

export const importClipboardImage = (bytes: ArrayBuffer): Promise<string> =>
	invoke<string>("import_clipboard_image", bytes);

export const importNoteMedia = (sourcePath: string, mediaType: "audio" | "video"): Promise<string> =>
	invoke<string>("import_note_media", { sourcePath, mediaType });

export const cleanupOrphanedMedia = (): Promise<MediaCleanupSummary> =>
	invoke<MediaCleanupSummary>("cleanup_orphaned_media");

export const readNoteImage = (imageId: string): Promise<ArrayBuffer> =>
	invoke<ArrayBuffer>("read_note_image", { imageId });

export const getNoteMediaStreamUrl = (mediaId: string, mediaType: "audio" | "video"): Promise<string> =>
	invoke<string>("note_media_stream_url", { mediaId, mediaType });
