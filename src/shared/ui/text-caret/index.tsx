import { Show, type Component } from "solid-js";
import { caretStyle } from "./style.css.ts";

export type CaretGeometry = { left: number; top: number; height: number; fontSize?: number };

const TextCaret: Component<{ geometry?: CaretGeometry }> = (props) =>
    <Show when={props.geometry}>{(geometry) =>
        <span class={caretStyle} aria-hidden="true" style={{
            left: `${geometry().left}px`, top: `${geometry().top}px`, height: `${geometry().height}px`,
            "font-size": geometry().fontSize ? `${geometry().fontSize}px` : undefined,
        }} />
    }</Show>;

export default TextCaret;
