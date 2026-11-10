import { createMemo, For, lazy, Suspense, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { headingScales, sliceTextRuns, type FormattedBlock, type TextRun } from "@/shared/lib/formatted-text";
import type { TranslationKey } from "@/shared/lib/i18n";
import FormattedTable from "@/shared/ui/formatted-table";
import TaskCheckbox from "@/shared/ui/task-checkbox";
import { styles } from "./style.css";

const HighlightedCode = lazy(() => import("@/shared/ui/highlighted-code"));

export const FormattedListView: Component<{
    blocks: FormattedBlock[];
    ordered: boolean;
    indent: string;
    start?: number;
    renderRuns: (runs: TextRun[]) => JSX.Element;
}> = (props) => (
    <Dynamic component={props.ordered ? "ol" : "ul"} class={styles.list} start={props.ordered ? props.start : undefined}
        style={{ "margin-left": `${props.indent.length * 0.5}em` }}>
        <For each={props.blocks}>{(block) => <li>{block.text ? props.renderRuns(block.runs) : "\u200B"}</li>}</For>
    </Dynamic>
);

const FormattedBlockView: Component<{
    block: FormattedBlock; renderRuns: (runs: TextRun[]) => JSX.Element;
    t: (key: TranslationKey) => string;
    fragment?: boolean; start?: number; end?: number;
    markerSide?: "left" | "right"; markerOffset?: number;
    onToggleTask?: (sourceLine: number, checked: boolean) => void;
}> = (props) => {
    const content = () => {
        const block = props.block;
        const start = props.start ?? 0;
        const end = props.end ?? block.text.length;
        if (block.task && start === 0) return <>{block.task.indent}<TaskCheckbox checked={block.task.checked}
            label={props.t(block.task.checked ? "taskUncheck" : "taskCheck")}
            onChange={props.onToggleTask ? (checked) => props.onToggleTask!(block.sourceLine, checked) : undefined} />
            {props.renderRuns(sliceTextRuns(block.runs, block.task.prefixLength, end))}</>;
        return block.text ? props.renderRuns(sliceTextRuns(block.runs, start, end)) : "\u200B";
    };
    const view = createMemo(() => {
        if (props.block.kind === "table") return <FormattedTable table={props.block.table} sourceLine={props.block.sourceLine} renderRuns={props.renderRuns} />;
        if (props.block.kind === "code") return <pre class={styles.code} data-formatted-code={props.block.sourceLine}><Suspense fallback={props.block.text}><HighlightedCode text={props.block.text} language={props.block.language} /></Suspense></pre>;
        if (props.block.kind === "separator") return <hr class={styles.separator} />;
        if (props.block.quote) return <blockquote class={styles.quote} style={{ "padding-left": `${props.block.quote * 12}px` }}>{content()}</blockquote>;
        if (props.block.ordered || props.block.bullet) {
            const marker = props.block.ordered;
            const indent = marker?.indent ?? props.block.bullet!.indent;
            if (props.fragment) return <>{(props.start ?? 0) === 0 ? <span
                class={props.markerSide === "right" ? styles.markerRight : styles.marker}
                style={{ transform: props.markerOffset ? `translateX(${props.markerOffset}px)` : undefined }}
                aria-hidden="true">{props.markerSide === "right"
                    ? `${indent} ${marker ? `${marker.number}.` : "•"}`
                    : `${indent}${marker ? `${marker.number}. ` : "• "}`}</span> : undefined}{content()}</>;
            return <Dynamic component={marker ? "ol" : "ul"} class={styles.list} start={marker ? Number(marker.number) : undefined}
                style={{ "margin-left": `${indent.length * 0.5}em` }}><li>{content()}</li></Dynamic>;
        }
        if (props.fragment) return content();
        return <Dynamic component={props.block.kind === "heading" ? `h${props.block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6" : "div"}
            style={{ margin: "0", "font-size": `${headingScales[props.block.level] ?? 1}em`, "font-weight": props.block.kind === "heading" ? 600 : 400, "line-height": "1.65", "min-height": "1.65em" }}>{content()}</Dynamic>;
    });
    return <>{view()}</>;
};
export default FormattedBlockView;
