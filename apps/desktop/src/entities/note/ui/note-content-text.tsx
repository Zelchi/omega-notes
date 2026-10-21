import Link from "@/shared/ui/link";
import { For, Show, createMemo, type Component } from "solid-js";
import { parseNoteTextLinks } from "../model/text-links";
import type { NoteSummary } from "../model/note";
import { parseFormattedText, type TextRun } from "@/shared/lib/formatted-text";
import FormattedRun from "@/shared/ui/formatted-run";
import FormattedBlockView from "@/shared/ui/formatted-block";
import ExternalLink from "@/shared/ui/external-link";
import type { TranslationKey } from "@/shared/lib/i18n";

type TextPart = { text: string; note?: NoteSummary };

type NoteContentTextProps = {
    text: string;
    class?: string;
    linkClass?: string;
    t: (key: TranslationKey) => string;
    referenceTitles: Record<string, string>;
    resolveNote: (target: string) => NoteSummary | undefined;
    onOpenNote: (note: NoteSummary) => void;
};

const NoteReferences: Component<NoteContentTextProps> = (props) => {
    const parts = createMemo(() => {
        const text = props.text;
        const result: TextPart[] = [];
        let offset = 0;
        for (const link of parseNoteTextLinks(text)) {
            if (link.kind !== "note") continue;
            if (link.start > offset) result.push({ text: text.slice(offset, link.start) });
            const note = props.resolveNote(link.target);
            result.push({ text: link.alias || note?.title || props.referenceTitles[link.target] || text.slice(link.start, link.end), note });
            offset = link.end;
        }
        if (offset < text.length) result.push({ text: text.slice(offset) });
        return result;
    });
    return <For each={parts()}>{(part) =>
        <Show when={part.note} fallback={part.text}>{(note) =>
            <Link class={props.linkClass} href={`#${note().id}`} onClick={(event) => {
                event.preventDefault();
                props.onOpenNote(note());
            }}>{part.text}</Link>
        }</Show>
    }</For>;
};

const NoteContentText: Component<NoteContentTextProps> = (props) => {
    const blocks = createMemo(() => parseFormattedText(props.text));
    const renderRuns = (runs: TextRun[]) => <For each={runs}>{(run) => (
        <FormattedRun run={run}>{run.code ? run.text : run.url ? <ExternalLink url={run.url} class={props.linkClass}>{run.text}</ExternalLink> : <NoteReferences t={props.t} text={run.text}
            linkClass={props.linkClass} referenceTitles={props.referenceTitles} resolveNote={props.resolveNote} onOpenNote={props.onOpenNote} />}</FormattedRun>
    )}</For>;
    return <div class={props.class}><For each={blocks()}>{(block) =>
        <FormattedBlockView block={block} renderRuns={renderRuns} t={props.t} />
    }</For></div>;
};

export default NoteContentText;
