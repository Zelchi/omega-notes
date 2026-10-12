import { createUuidV7 } from "@/shared/lib/ids";

export type NoteTextAlignment = "left" | "center" | "justify" | "right";

export type NoteTextElement = {
	id: string;
	type: "text";
	x: number;
	y: number;
	width: number;
	height: number;
	text: string;
	alignment: NoteTextAlignment;
};

export type NoteImageElement = {
	id: string;
	type: "image";
	x: number;
	y: number;
	width: number;
	height: number;
	imageId?: string;
	dataUrl?: string;
};

export type NoteAudioElement = {
	id: string;
	type: "audio";
	x: number;
	y: number;
	width: number;
	height: number;
	volume: number;
	audioId?: string;
	extension: string;
	dataUrl?: string;
};

export type NoteVideoElement = {
	id: string;
	type: "video";
	x: number;
	y: number;
	width: number;
	height: number;
	videoId?: string;
	extension: string;
	dataUrl?: string;
};

export type NotePositionedElement = NoteImageElement | NoteAudioElement | NoteVideoElement;
export type NoteMediaElement = NoteAudioElement | NoteVideoElement;
export type NoteElement = NoteTextElement | NotePositionedElement;

export type NoteDocument = {
	format: "omega-document";
	version: 1;
	page: { width: number; height: number };
	elements: NoteElement[];
};

export const DEFAULT_PAGE_SIZE = { width: 794, height: 1123 };
export const MIN_AUDIO_WIDTH = 340;
export const DEFAULT_AUDIO_VOLUME = 0.5;

export const createTextElement = (text = "", x = 32, y = 32, width = 728): NoteTextElement => {
	const lines = Math.max(1, text.split("\n").length);
	return {
		id: createUuidV7(),
		type: "text",
		x,
		y,
		width,
		height: Math.max(44, lines * 29 + 16),
		text,
		alignment: "left",
	};
};

export const createImageElement = (
	source: { imageId: string } | { dataUrl: string },
	x = 32,
	y = 32,
): NoteImageElement => {
	return {
		id: createUuidV7(),
		type: "image",
		x,
		y,
		width: 360,
		height: 0,
		...source,
	};
};

export const createAudioElement = (
	source: { audioId: string; extension: string } | { dataUrl: string; extension: string },
	x = 32,
	y = 32,
): NoteAudioElement => ({
	id: createUuidV7(),
	type: "audio",
	x,
	y,
	width: 360,
	height: 54,
	volume: DEFAULT_AUDIO_VOLUME,
	...source,
});

export const createVideoElement = (
	source: { videoId: string; extension: string } | { dataUrl: string; extension: string },
	x = 32,
	y = 32,
): NoteVideoElement => ({
	id: createUuidV7(),
	type: "video",
	x,
	y,
	width: 360,
	height: 203,
	...source,
});

export const createEmptyDocument = (): NoteDocument => {
	return {
		format: "omega-document",
		version: 1,
		page: { ...DEFAULT_PAGE_SIZE },
		elements: [createTextElement()],
	};
};

export const documentText = (document: NoteDocument): string => {
	return document.elements.flatMap((element) => (element.type === "text" ? [element.text] : [])).join("\n");
};

export const documentPreview = (document: NoteDocument): string => {
	return (
		documentText(document)
			.split("\n")
			.map((line) => line.trim())
			.find(Boolean)
			?.slice(0, 160) ?? ""
	);
};
