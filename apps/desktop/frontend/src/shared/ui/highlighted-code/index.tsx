import { createMemo, For, type Component } from "solid-js";
import { highlightCode } from "@/shared/lib/syntax-highlight";
import { styles, tokenStyles } from "./style.css";

const HighlightedCode: Component<{ text: string; language?: string }> = (props) => {
    const tokens = createMemo(() => highlightCode(props.text || "\u200B", props.language));
    const tokenClass = (types: string[]) => [...types].reverse().map((type) => tokenStyles[type]).find(Boolean);
    return <code class={styles.root} data-language={props.language}><For each={tokens()}>{(token) =>
        <span class={tokenClass(token.types)}>{token.text}</span>
    }</For></code>;
};

export default HighlightedCode;
