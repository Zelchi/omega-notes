export type ImportedImage = { type: "image"; imageId: string } | { type: "image"; dataUrl: string };

export type ImportedAudio =
	{ type: "audio"; audioId: string; extension: string } | { type: "audio"; dataUrl: string; extension: string };

export type ImportedVideo =
	{ type: "video"; videoId: string; extension: string } | { type: "video"; dataUrl: string; extension: string };

export type ImportedMedia = ImportedImage | ImportedAudio | ImportedVideo;
