import { externalLinkUrl } from "@/shared/lib/external-links";
import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import { parseNoteTextLinks } from "@/entities/note";
import { fetchPageTitle } from "../api/page-title.repository";

export const pastedUrl = (value: string): string | undefined => externalLinkUrl(value.trim());

export const canResolvePastedUrl = (text: string, range: { start: number; end: number }): boolean => {
    let marker = "\u0000omega-url-paste\u0000";
    while (text.includes(marker)) marker += "\u0000";
    const probe = text.slice(0, range.start) + marker + text.slice(range.start);
    let prose = false;
    mapTextOutsideCode(probe, (value) => { if (value.includes(marker)) prose = true; return value; });
    if (!prose) return false;
    return !parseNoteTextLinks(text).some((link) => range.start > link.start && range.start < link.end);
};

export const resolvePastedLink = async (url: string): Promise<string | undefined> => {
    try {
        const title = (await fetchPageTitle(url))?.replace(/\s+/g, " ").trim();
        if (!title || title.includes("\uFFFD")) return;
        const label = Array.from(title).slice(0, 300).join("").replace(/[\\[\]]/g, "\\$&");
        const destination = url.replace(/\(/g, "%28").replace(/\)/g, "%29");
        return `[${label}](${destination})`;
    } catch { return; }
};
