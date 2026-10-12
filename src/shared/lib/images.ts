export const createImageObjectUrl = (data: ArrayBuffer): string => {
	const bytes = new Uint8Array(data);
	const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

	let type: string;
	if (text(0, 8) === "\x89PNG\r\n\x1a\n") type = "image/png";
	else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = "image/jpeg";
	else if (text(0, 3) === "GIF") type = "image/gif";
	else if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") type = "image/webp";
	else if (text(0, 2) === "BM") type = "image/bmp";
	else if (text(4, 8) === "ftyp" && ["avif", "avis"].includes(text(8, 12))) type = "image/avif";
	else throw new Error("Unsupported image format");

	return URL.createObjectURL(new Blob([data], { type }));
};
