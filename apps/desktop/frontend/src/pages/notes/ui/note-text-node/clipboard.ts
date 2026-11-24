import { htmlClipboardToNoteText } from "@/shared/lib/html-clipboard-to-note-text";
import { normalizeClipboardText } from "@/shared/lib/normalize-clipboard-text";

const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

type NoteClipboard = Pick<Clipboard, "readText"> & Partial<Pick<Clipboard, "read">>;
type ClipboardPaste = { images: File[]; text?: string };

export const readNoteClipboardEvent = (
	data: Pick<DataTransfer, "files" | "getData"> | null,
	plainText: boolean,
	acceptImages: boolean,
): ClipboardPaste => {
	const images = plainText ? [] : [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
	if (acceptImages && images.length) return { images };

	const htmlText = plainText ? "" : data?.getData("text/html");
	const clipboardText = htmlText
		? htmlClipboardToNoteText(htmlText) || data?.getData("text/plain")
		: data?.getData("text/plain");
	return clipboardText === undefined
		? { images: [] }
		: { images: [], text: normalizeClipboardText(clipboardText) };
};

export const readNoteClipboard = async (
	clipboard: NoteClipboard,
	plainText: boolean,
	acceptImages: boolean,
): Promise<ClipboardPaste> => {
	if (plainText || !clipboard.read) return { images: [], text: await clipboard.readText() };

	let items: ClipboardItems | undefined;
	try {
		items = await clipboard.read();
	} catch {
		// Fall back to text-only clipboard access when reading clipboard items is unavailable.
	}

	const images: File[] = [];
	for (const item of items ?? []) {
		const type = item.types.find((candidate) => imageTypes.has(candidate.toLowerCase()));
		if (!type) continue;
		const normalizedType = type.toLowerCase();
		const blob = await item.getType(type);
		const extension = normalizedType.split("/")[1] ?? "png";
		images.push(new File([blob], `clipboard-image-${images.length + 1}.${extension}`, { type: normalizedType }));
	}
	if (acceptImages && images.length) return { images };

	const textItem = items?.find((item) => item.types.some((type) => type.toLowerCase() === "text/plain"));
	const htmlItem = items?.find((item) => item.types.some((type) => type.toLowerCase() === "text/html"));
	const htmlType = htmlItem?.types.find((type) => type.toLowerCase() === "text/html");
	let formattedText: string | undefined;
	if (htmlItem && htmlType) {
		try {
			formattedText = htmlClipboardToNoteText(await (await htmlItem.getType(htmlType)).text());
		} catch {
			// Fall back to the plain-text clipboard representation.
		}
	}
	const text = formattedText ?? (textItem
		? await (await textItem.getType("text/plain")).text()
		: await clipboard.readText());
	return { images: [], text };
};
