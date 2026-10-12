import { For, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { parseFormattedText, sliceTextRuns, headingScales, type TextRun, type FormattedFragment } from "@/features/format-text";
import { resolveNoteReference, type StudyNote } from "@/entities/note";
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

const splitTrailingPunctuation = (value: string): [string, string] => {
	let end = value.length;
	while (/[.,!?;:'"“”‘’]/u.test(value[end - 1] ?? "")) end -= 1;

	for (const [closing, opening] of [
		[")", "("],
		["]", "["],
		["}", "{"],
	] as const) {
		while (value[end - 1] === closing) {
			const candidate = value.slice(0, end);
			const openCount = [...candidate].filter((character) => character === opening).length;
			const closeCount = [...candidate].filter((character) => character === closing).length;
			if (closeCount <= openCount) break;
			end -= 1;
		}
	}

	return [value.slice(0, end), value.slice(end)];
};

const renderNoteLinks = (text: string, options: RenderTextOptions): JSX.Element => (
	<For each={text.split(/(\[\[[^\]]+\]\]|(?:https?:\/\/|www\.)[^\s<]+)/gi)}>
		{(part) => {
			const match = part.match(/^\[\[([^\]]+)\]\]$/);
			if (match) {
				const body = match[1] ?? "";
				const separator = body.indexOf("|");
				const target = (separator < 0 ? body : body.slice(0, separator)).trim();
				const label = (separator < 0 ? target : body.slice(separator + 1)).trim();
				const note = resolveNoteReference(target, options.notesById, options.notesByTitle);
				if (!note) return label;

				return (
					<a
						href={`#${note.id}`}
						onClick={(event) => {
							event.preventDefault();
							options.onOpenNote(note);
						}}
						style={textLinkStyle}
					>
						{label}
					</a>
				);
			}

			if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;
			const [urlText, punctuation] = splitTrailingPunctuation(part);
			const href = urlText.toLowerCase().startsWith("www.") ? `https://${urlText}` : urlText;
			try {
				const url = new URL(href);
				if (url.protocol !== "http:" && url.protocol !== "https:") return part;
			} catch {
				return part;
			}

			return (
				<>
					<a
						href={href}
						target={isTauriRuntime() ? undefined : "_blank"}
						rel="noopener noreferrer"
						onClick={(event) => {
							if (!isTauriRuntime()) return;
							event.preventDefault();
							options.onOpenExternalUrl(href);
						}}
						style={textLinkStyle}
					>
						{urlText}
					</a>
					{punctuation}
				</>
			);
		}}
	</For>
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
