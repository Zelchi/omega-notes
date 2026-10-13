import { For, Show, createMemo, type Component } from "solid-js";
import { parseNoteTextLinks, type StudyNote } from "@/entities/note";
import { styles } from "./style.css.ts";

type TextPart = { text: string; note?: StudyNote };

const NoteReferences: Component<{
    text: string;
    resolveNote: (target: string) => StudyNote | undefined;
    onOpenNote: (note: StudyNote) => void;
}> = (props) => {
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

export default NoteReferences;
