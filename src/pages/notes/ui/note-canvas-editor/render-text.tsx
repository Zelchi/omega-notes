import { For, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { parseFormattedText, sliceTextRuns, headingScales, type TextRun, type FormattedFragment } from "@/features/format-text";
import { parseNoteTextLinks, resolveNoteReference, type NoteTextLink, type StudyNote } from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";

type RenderTextOptions = {
	notesById: Map<string, StudyNote>;
	notesByTitle: Map<string, StudyNote>;
	onOpenNote: (note: StudyNote) => void;
	onOpenExternalUrl: (url: string) => void;
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
            if (!note) return link.label;
            return <a href={`#${note.id}`} style={textLinkStyle}
                onClick={(event) => { event.preventDefault(); options.onOpenNote(note); }}>{link.label}</a>;
        }
        return <a href={link.url} target={isTauriRuntime() ? undefined : "_blank"}
            rel="noopener noreferrer" style={textLinkStyle}
            onClick={(event) => {
                if (!isTauriRuntime()) return;
                event.preventDefault();
                options.onOpenExternalUrl(link.url);
            }}>{link.label}</a>;
    }}</For>
);

const renderRuns = (runs: TextRun[], options: RenderTextOptions): JSX.Element => (
	<For each={runs}>
		{(run) => <span style={{ "font-weight": run.bold ? 700 : undefined, "font-style": run.italic ? "italic" : undefined }}>
			{renderNoteLinks(run.text, options)}
		</span>}
	</For>
);

const separator = (): JSX.Element => <hr style={{ margin: "0.75em 0", border: "0", "border-top": "1px solid var(--border-strong)" }} />;

export const renderNoteText = (text: string, options: RenderTextOptions, format?: FormattedFragment): JSX.Element => {
	if (format) {
		return format.block.kind === "separator" ? separator() : renderRuns(sliceTextRuns(format.block.runs, format.start, format.end), options);
	}
	return <For each={parseFormattedText(text)}>{(block) => {
		if (block.kind === "separator") return <div style={{ "min-height": "1.65em", display: "flow-root" }}>{separator()}</div>;
		return <Dynamic component={block.kind === "heading" ? `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6" : "div"}
			style={{ margin: "0", "font-size": `${headingScales[block.level] ?? 1}em`, "font-weight": block.kind === "heading" ? 600 : 400, "line-height": "1.65", "min-height": "1.65em" }}>
			{block.text ? renderRuns(block.runs, options) : "\u200B"}
		</Dynamic>;
	}}</For>;
};
