import type { Component, ComponentProps } from "solid-js";
import { NoteContentText } from "@/entities/note/ui";
import { styles } from "./style.css.ts";

const ChatMessageText: Component<Omit<ComponentProps<typeof NoteContentText>, "class" | "linkClass">> = props =>
    <NoteContentText {...props} class={styles.messageText} linkClass={styles.noteLink} />;

export default ChatMessageText;
