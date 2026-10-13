import { For, Show, createMemo, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { parseNoteTextLinks, type StudyNote } from "@/entities/note";
import { parseFormattedText, headingScales } from "@/shared/lib/formatted-text";
import { styles } from "./style.css.ts";

type TextPart = { text: string; note?: StudyNote };

type ChatMessageTextProps = {
    text: string;
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
            result.push({ text: note ? link.label || note.title : text.slice(link.start, link.end), note });
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
    return <div class={styles.messageText}>
        <For each={blocks()}>{(block) => (
            <Show when={block.kind !== "separator"} fallback={<hr class={styles.textSeparator} />}>
                <Dynamic component={block.kind === "heading" ? `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6" : "div"}
                    style={{ margin: "0", "min-height": "1.65em", "line-height": "1.65", "font-size": `${headingScales[block.level] ?? 1}em`, "font-weight": block.kind === "heading" ? 600 : 400 }}>
                    <For each={block.runs}>{(run) => (
                        <span style={{ "font-weight": run.bold ? 700 : undefined, "font-style": run.italic ? "italic" : undefined }}>
                            <NoteReferences text={run.text} resolveNote={props.resolveNote} onOpenNote={props.onOpenNote} />
                        </span>
                    )}</For>
                </Dynamic>
            </Show>
        )}</For>
    </div>;
};

export default ChatMessageText;
