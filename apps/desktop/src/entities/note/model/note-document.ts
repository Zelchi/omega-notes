import { createUuidV7 } from "@/shared/lib/ids";
import type { NoteMediaSource } from "./note";

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
	paragraphAlignments?: NoteTextAlignment[];
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

export type NotePositionedElement = NoteImageElement;
export type NoteElement = NoteTextElement | NotePositionedElement;

export const noteMediaSource = (element: NotePositionedElement): NoteMediaSource | undefined => {
	if (element.imageId) return { type: "image", imageId: element.imageId };
	if (element.dataUrl) return { type: "image", dataUrl: element.dataUrl };
	return undefined;
};

export type NoteDocument = {
	format: "omega-document";
	version: 1;
	page: { width: number; height: number };
	elements: NoteElement[];
};

export const DEFAULT_PAGE_SIZE = { width: 794, height: 1123 };

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
