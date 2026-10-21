import Link from "@/shared/ui/link";
import { For, type JSX } from "solid-js";
import FormattedRun from "@/shared/ui/formatted-run";
import FormattedBlockView from "@/shared/ui/formatted-block";
import ExternalLink from "@/shared/ui/external-link";
import type { TranslationKey } from "@/shared/lib/i18n";
import { parseFormattedText, type TextRun, type FormattedFragment } from "@/features/format-text";
import { parseNoteTextLinks, resolveNoteReference, canCreateNoteReference, displayNoteTitle, normalizeNoteTitle, type NoteTextLink, type NoteSummary } from "@/entities/note";

type RenderTextOptions = {
	notesById: Map<string, NoteSummary>;
	notesByTitle: Map<string, NoteSummary>;
	rememberedTitles: ReadonlyMap<string, string>;
	onOpenNote: (note: NoteSummary) => void;
	onOpenMissingNote?: (target: string) => void;
	onOpenExternalUrl: (url: string) => void;
	t: (key: TranslationKey) => string;
	onToggleTask?: (sourceLine: number, checked: boolean) => void;
};

const textLinkStyle = {
	color: "var(--ink)",
	"text-decoration": "underline",
	"text-decoration-color": "var(--muted)",
};

const linkTextParts = (text: string): ({ text: string } | { link: NoteTextLink })[] => {
    const parts: ({ text: string } | { link: NoteTextLink })[] = [];
    let offset = 0;
    for (const link of parseNoteTextLinks(text)) {
        if (link.start > offset) parts.push({ text: text.slice(offset, link.start) });
        parts.push({ link });
        offset = link.end;
    }
    if (offset < text.length) parts.push({ text: text.slice(offset) });
    return parts;
};

const renderNoteLinks = (text: string, options: RenderTextOptions): JSX.Element => (
    <For each={linkTextParts(text)}>{(part) => {
        if ("text" in part) return part.text;
        const link = part.link;
        if (link.kind === "note") {
            const note = resolveNoteReference(link.target, options.notesById, options.notesByTitle);
            if (!note) {
                const rememberedTitle = options.rememberedTitles.get(normalizeNoteTitle(link.target));
                if (rememberedTitle !== undefined) return link.alias || rememberedTitle;
                if (!options.onOpenMissingNote || !canCreateNoteReference(link.target)) return link.label;
                return <Link href="#" style={{ ...textLinkStyle, "text-decoration-style": "dashed" }} onClick={(event) => {
                    event.preventDefault(); options.onOpenMissingNote!(link.target);
                }}>{link.label}</Link>;
            }
            return <Link href={`#${note.id}`} style={textLinkStyle}
				onClick={(event) => { event.preventDefault(); options.onOpenNote(note); }}>{link.alias || displayNoteTitle(note)}</Link>;
        }
        return <ExternalLink url={link.url} style={textLinkStyle} onOpen={options.onOpenExternalUrl}>{link.label}</ExternalLink>;
    }}</For>
);

const renderRuns = (runs: TextRun[], options: RenderTextOptions): JSX.Element => (
	<For each={runs}>{(run) => <FormattedRun run={run}>{run.code ? run.text : run.url
        ? <ExternalLink url={run.url} style={textLinkStyle} onOpen={options.onOpenExternalUrl}>{run.text}</ExternalLink>
        : renderNoteLinks(run.text, options)}</FormattedRun>}</For>
);

export const renderNoteText = (text: string, options: RenderTextOptions, format?: FormattedFragment): JSX.Element => {
	if (format) return <FormattedBlockView block={format.block} fragment start={format.start} end={format.end}
		renderRuns={(runs) => renderRuns(runs, options)} t={options.t} onToggleTask={options.onToggleTask} />;
	return <For each={parseFormattedText(text)}>{(block) => <FormattedBlockView block={block}
		renderRuns={(runs) => renderRuns(runs, options)} t={options.t} onToggleTask={options.onToggleTask} />}</For>;
};
