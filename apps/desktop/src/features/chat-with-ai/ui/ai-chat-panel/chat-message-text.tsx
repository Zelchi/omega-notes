import { For, Show, createMemo, type Component } from "solid-js";
import { parseNoteTextLinks, type StudyNote } from "@/entities/note";
import { parseFormattedText, type TextRun } from "@/shared/lib/formatted-text";
import FormattedRun from "@/shared/ui/formatted-run";
import FormattedBlockView from "@/shared/ui/formatted-block";
import ExternalLink from "@/shared/ui/external-link";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "./style.css.ts";

type TextPart = { text: string; note?: StudyNote };

type ChatMessageTextProps = {
    text: string;
    t: (key: TranslationKey) => string;
    referenceTitles: Record<string, string>;
    resolveNote: (target: string) => StudyNote | undefined;
    onOpenNote: (note: StudyNote) => void;
};

const NoteReferences: Component<ChatMessageTextProps> = (props) => {
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
            <a class={styles.noteLink} href={`#${note().id}`} onClick={(event) => {
                event.preventDefault();
                props.onOpenNote(note());
            }}>{part.text}</a>
        }</Show>
    }</For>;
};

const ChatMessageText: Component<ChatMessageTextProps> = (props) => {
    const blocks = createMemo(() => parseFormattedText(props.text));
    const renderRuns = (runs: TextRun[]) => <For each={runs}>{(run) => (
        <FormattedRun run={run}>{run.code ? run.text : run.url ? <ExternalLink url={run.url} class={styles.noteLink}>{run.text}</ExternalLink> : <NoteReferences t={props.t} text={run.text}
            referenceTitles={props.referenceTitles} resolveNote={props.resolveNote} onOpenNote={props.onOpenNote} />}</FormattedRun>
    )}</For>;
    return <div class={styles.messageText}><For each={blocks()}>{(block) =>
        <FormattedBlockView block={block} renderRuns={renderRuns} t={props.t} />
    }</For></div>;
};

export default ChatMessageText;
