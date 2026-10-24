export type ExternalMarkdownLink = { start: number; end: number; label: string; url: string };

export const externalLinkUrl = (value: string): string | undefined => {
    const url = /^www\./i.test(value) ? `https://${value}` : value;
    if (!/^https?:\/\//i.test(url) || /\s/.test(url)) return;
    try {
        if (!["http:", "https:"].includes(new URL(url).protocol)) return;
        return url;
    } catch { return; }
};

/** Leia um link HTTP nomeado, preservando parênteses balanceados no destino. */
export const readExternalMarkdownLink = (text: string, start: number): ExternalMarkdownLink | undefined => {
    if (text[start] !== "[" || text[start + 1] === "[" || ["!", "[", "\\"].includes(text[start - 1] ?? "")) return;
    let label = "", labelEnd = -1;
    for (let index = start + 1; index < text.length; index++) {
        const character = text[index]!;
        if (character === "\\" && /[\\[\]]/.test(text[index + 1] ?? "")) { label += text[++index]; continue; }
        if (character === "]" && text[index + 1] === "(") { labelEnd = index; break; }
        if (/[\[\]\r\n]/.test(character)) return;
        label += character;
    }
    if (labelEnd < 0 || !label.trim()) return;
    const urlStart = labelEnd + 2;
    let depth = 1;
    for (let index = urlStart; index < text.length; index++) {
        const character = text[index];
        if (character === "\n" || character === "\r") return;
        if (character === "(") depth++;
        if (character !== ")" || --depth > 0) continue;
        const url = externalLinkUrl(text.slice(urlStart, index).trim());
        return url ? { start, end: index + 1, label, url } : undefined;
    }
};
