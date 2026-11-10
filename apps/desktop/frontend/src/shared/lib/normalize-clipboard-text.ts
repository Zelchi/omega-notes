/** Normalize platform-specific clipboard text before editor offsets are calculated. */
export const normalizeClipboardText = (text: string): string =>
	text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").normalize("NFC");
