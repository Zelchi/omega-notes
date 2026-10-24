import { invoke, isTauriRuntime, readBinary } from "@/shared/lib/desktop";
import { pathForFile } from "@/shared/lib/desktop";
import { open } from "@/shared/lib/desktop";

export type MediaCleanupSummary = { images: number; audio: number; video: number };

export type DroppedMediaFiles = {
	paths: string[];
	x: number;
	y: number;
};

export const onMediaFilesDropped = async (handler: (drop: DroppedMediaFiles) => void): Promise<() => void> => {
	if (isTauriRuntime()) {
		const drop = (event: Event) => handler((event as CustomEvent<DroppedMediaFiles>).detail);
		window.addEventListener("omega-files-dropped", drop);
		return () => window.removeEventListener("omega-files-dropped", drop);
	}
    const dragover = (event: DragEvent) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); };
    const drop = async (event: DragEvent) => {
        if (!event.dataTransfer?.files.length) return;
        event.preventDefault();
        const paths = (await Promise.all(Array.from(event.dataTransfer.files).map(pathForFile))).filter(Boolean);
        if (paths.length) handler({ paths, x: event.clientX, y: event.clientY });
    };
    window.addEventListener("dragover", dragover, true);
    window.addEventListener("drop", drop, true);
    return () => { window.removeEventListener("dragover", dragover, true); window.removeEventListener("drop", drop, true); };
};

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
	invoke<string>("import_clipboard_image", { bytes: Array.from(new Uint8Array(bytes)) });

export const importNoteMedia = (sourcePath: string, mediaType: "audio" | "video"): Promise<string> =>
  invoke<string>("import_note_media", { sourcePath, mediaType });

export const getNoteMediaStreamUrl = (mediaId: string, mediaType: "audio" | "video"): Promise<string> =>
  invoke<string>("note_media_stream_url", { mediaId, mediaType });

export const cleanupOrphanedMedia = (): Promise<MediaCleanupSummary> =>
	invoke<MediaCleanupSummary>("cleanup_orphaned_media");

export const readNoteImage = (imageId: string): Promise<ArrayBuffer> =>
	readBinary("read_note_image", { imageId });
